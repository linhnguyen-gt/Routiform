/**
 * Attachment rehydration, and the body-size property that motivates it.
 *
 * Isolated onto a temp DATA_DIR before importing the db module — core.ts resolves SQLITE_FILE at
 * module load and memoizes the handle, so setting this afterwards would write into the user's
 * real ~/.routiform/storage.sqlite.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-rehydrate-"));

const { putAttachment } = await import("../../src/lib/db/chat.ts");
const { rehydrateAttachments } = await import("../../src/lib/chat/rehydrate-attachments.ts");

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x7a),
]);

function fileRef(sha256, filename, mediaType = "image/png") {
  return { type: "file", mediaType, filename, url: `/api/attachments/${sha256}` };
}

test("rehydrate: an image reference becomes a data URL the translators can carry", () => {
  const stored = putAttachment(PNG_BYTES, "image/png");

  const [message] = rehydrateAttachments([
    {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "what is this" }, fileRef(stored.sha256, "shot.png")],
    },
  ]);

  const filePart = message.parts.find((p) => p.type === "file");
  assert.ok(filePart, "the file part must survive rehydration");
  assert.equal(filePart.mediaType, "image/png");
  assert.equal(
    filePart.url,
    `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
    "the provider needs bytes, not a URL it cannot fetch"
  );
  assert.equal(message.parts[0].text, "what is this", "sibling parts are left alone");
});

test("rehydrate: a text file is inlined so the model can actually read it", () => {
  // No translator has a text-attachment concept, so there is nothing to map a text file onto.
  // It has to become prompt text or it is invisible to the model.
  const source = Buffer.from("export const answer = 42;\n", "utf8");
  const stored = putAttachment(source, "text/plain");

  const [message] = rehydrateAttachments([
    {
      id: "m1",
      role: "user",
      parts: [fileRef(stored.sha256, "answer.ts", "text/plain")],
    },
  ]);

  assert.equal(message.parts[0].type, "text");
  assert.match(message.parts[0].text, /answer\.ts/);
  assert.match(message.parts[0].text, /export const answer = 42;/);
});

test("rehydrate: a missing blob degrades to a note, it does not vanish", () => {
  // Silently dropping the part would leave the model answering confidently about an image it
  // never received — the exact failure this whole phase exists to prevent.
  const [message] = rehydrateAttachments([
    {
      id: "m1",
      role: "user",
      parts: [fileRef("f".repeat(64), "gone.png")],
    },
  ]);

  assert.equal(message.parts[0].type, "text");
  assert.match(message.parts[0].text, /no longer available/i);
});

test("rehydrate: unrelated messages and parts pass through untouched", () => {
  const input = [
    { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
    { id: "m2", role: "assistant", parts: [{ type: "text", text: "hi" }] },
  ];
  assert.deepEqual(rehydrateAttachments(input), input);
});

test("rehydrate: four 2 MB images across five turns keep the wire body small", () => {
  // The specific failure the blob store exists to prevent. useChat re-POSTs the ENTIRE message
  // array every turn; proxy.ts caps bodies at 10 MB (bodySizeGuard.ts, no /api/chat exemption);
  // base64 inflates ~33%. Inlined, turn five would be ~11 MB and 413 before the route is even
  // reached — the conversation would be bricked, unable to send OR regenerate.
  const twoMb = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2 * 1024 * 1024, 0x5a),
  ]);

  const refs = [0, 1, 2, 3].map((i) => {
    // Distinct bytes per image so they do not dedupe into one row.
    const bytes = Buffer.from(twoMb);
    bytes.writeUInt8(i, 8);
    return fileRef(putAttachment(bytes, "image/png").sha256, `photo-${i}.png`);
  });

  const conversation = [];
  for (let turn = 0; turn < 5; turn++) {
    conversation.push({
      id: `u${turn}`,
      role: "user",
      parts:
        turn === 0
          ? [{ type: "text", text: "compare these" }, ...refs]
          : [{ type: "text", text: "and now?" }],
    });
    conversation.push({ id: `a${turn}`, role: "assistant", parts: [{ type: "text", text: "ok" }] });
  }

  const wireBytes = Buffer.byteLength(JSON.stringify({ messages: conversation }), "utf8");
  assert.ok(
    wireBytes < 10 * 1024 * 1024,
    `the re-POSTed body must stay under the 10 MB cap; got ${wireBytes} bytes`
  );
  assert.ok(
    wireBytes < 64 * 1024,
    `hash references should keep this in the kilobytes, not megabytes; got ${wireBytes} bytes`
  );

  // And the bytes still reach the provider once rehydrated.
  const rehydrated = rehydrateAttachments(conversation);
  const images = rehydrated[0].parts.filter((p) => p.type === "file");
  assert.equal(images.length, 4);
  assert.ok(images.every((p) => p.url.startsWith("data:image/png;base64,")));
});

test("rehydrate: the same image uploaded twice stores one row", () => {
  const a = putAttachment(PNG_BYTES, "image/png");
  const b = putAttachment(PNG_BYTES, "image/png");
  assert.equal(a.sha256, b.sha256, "content-addressed storage dedupes identical bytes");
});
