/**
 * Attachment classification.
 *
 * The rule under test: bytes decide what a file is, never the client's claim about it.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { classifyAttachment, isRejection, sniffImageMime, isProbablyText, MAX_ATTACHMENT_BYTES } =
  await import("../../src/lib/chat/attachments.ts");

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(16),
]);

test("attachments: images are identified by signature", () => {
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(GIF), "image/gif");
  assert.equal(sniffImageMime(WEBP), "image/webp");
});

test("attachments: a lie about the MIME type does not survive", () => {
  // The whole point of sniffing. A browser reports whatever the OS guessed from the extension,
  // and an attacker reports whatever they want.
  const result = classifyAttachment(PNG, "text/plain");
  assert.equal(isRejection(result), false);
  assert.equal(result.kind, "image");
  assert.equal(result.mime, "image/png", "the sniffed type wins over the declared one");
});

test("attachments: a non-image claiming to be an image is rejected, not inlined as text", () => {
  // Otherwise a corrupt upload gets silently pasted into the prompt as garbage text and the
  // model answers something baffling.
  const result = classifyAttachment(Buffer.from("this is not a png", "utf8"), "image/png");
  assert.equal(isRejection(result), true);
  assert.match(result.error, /supported image/i);
});

test("attachments: text files are accepted", () => {
  const result = classifyAttachment(Buffer.from("const x = 1;\n", "utf8"), "text/plain");
  assert.equal(isRejection(result), false);
  assert.equal(result.kind, "text");
});

test("attachments: binaries are rejected rather than inlined", () => {
  const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
  assert.equal(isProbablyText(binary), false);

  const result = classifyAttachment(binary, "application/octet-stream");
  assert.equal(isRejection(result), true);
});

test("attachments: oversized and empty files are rejected with a reason", () => {
  const tooBig = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0x41);
  const big = classifyAttachment(tooBig, "text/plain");
  assert.equal(isRejection(big), true);
  assert.match(big.error, /too large/i);

  const empty = classifyAttachment(Buffer.alloc(0), "text/plain");
  assert.equal(isRejection(empty), true);
});
