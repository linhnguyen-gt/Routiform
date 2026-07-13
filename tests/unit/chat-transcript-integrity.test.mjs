/**
 * The transcript the user sees on reload must be the transcript they actually have.
 *
 * These pin two bugs that a green unit suite happily shipped, because nothing exercised the
 * client's edit/regenerate paths against the table.
 *
 * Isolated onto a temp DATA_DIR before importing the db module — core.ts resolves SQLITE_FILE
 * at module load and memoizes the handle.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-transcript-"));

const { createConversation, appendMessage, listMessages, truncateMessagesTo } =
  await import("../../src/lib/db/chat.ts");

function textPart(text) {
  return [{ type: "text", text }];
}

/** Replays what /api/chat does when the client POSTs an array of `n` messages. */
function persistUserTurn(conversationId, clientMessages) {
  const last = clientMessages[clientMessages.length - 1];
  if (last?.role !== "user") return;
  truncateMessagesTo(conversationId, clientMessages.length - 1);
  appendMessage({
    conversationId,
    role: "user",
    parts: last.parts,
    status: "complete",
  });
}

test("transcript: regenerate does not duplicate the question or strand the old answer", () => {
  const convo = createConversation({ title: "t", model: "m", provider: "p" });

  // Turn 1, as it would be persisted.
  persistUserTurn(convo.id, [{ role: "user", parts: textPart("what is 2+2") }]);
  appendMessage({
    conversationId: convo.id,
    role: "assistant",
    parts: textPart("five"),
    status: "complete",
  });

  // The user hits regenerate. The SDK truncates its array to end at the user turn and
  // re-POSTs it — so the client now holds exactly ONE message.
  persistUserTurn(convo.id, [{ role: "user", parts: textPart("what is 2+2") }]);
  appendMessage({
    conversationId: convo.id,
    role: "assistant",
    parts: textPart("four"),
    status: "complete",
  });

  const rows = listMessages(convo.id);
  assert.equal(
    rows.length,
    2,
    `a regenerate must REPLACE the answer, not append a second question and a second answer. ` +
      `Got: ${JSON.stringify(rows.map((r) => [r.role, r.parts[0]?.text]))}`
  );
  assert.equal(rows[0].role, "user");
  assert.equal(rows[0].parts[0].text, "what is 2+2");
  assert.equal(rows[1].role, "assistant");
  assert.equal(rows[1].parts[0].text, "four", "the stale answer must be gone");
});

test("transcript: editing an earlier turn drops everything after it", () => {
  const convo = createConversation({ title: "t", model: "m", provider: "p" });

  persistUserTurn(convo.id, [{ role: "user", parts: textPart("first") }]);
  appendMessage({
    conversationId: convo.id,
    role: "assistant",
    parts: textPart("answer to first"),
    status: "complete",
  });
  persistUserTurn(convo.id, [
    { role: "user", parts: textPart("first") },
    { role: "assistant", parts: textPart("answer to first") },
    { role: "user", parts: textPart("second") },
  ]);
  appendMessage({
    conversationId: convo.id,
    role: "assistant",
    parts: textPart("answer to second"),
    status: "complete",
  });
  assert.equal(listMessages(convo.id).length, 4);

  // The user edits turn 1. handleEdit truncates client state to [] and puts the text back in
  // the composer; submitting re-POSTs a single-message array.
  persistUserTurn(convo.id, [{ role: "user", parts: textPart("first, but better") }]);

  const rows = listMessages(convo.id);
  assert.equal(
    rows.length,
    1,
    `an edit must drop the original turn AND everything that followed it. ` +
      `Got: ${JSON.stringify(rows.map((r) => [r.role, r.parts[0]?.text]))}`
  );
  assert.equal(rows[0].parts[0].text, "first, but better");
});

test("transcript: an ordinary turn appends and truncates nothing", () => {
  const convo = createConversation({ title: "t", model: "m", provider: "p" });

  persistUserTurn(convo.id, [{ role: "user", parts: textPart("one") }]);
  appendMessage({
    conversationId: convo.id,
    role: "assistant",
    parts: textPart("1"),
    status: "complete",
  });
  persistUserTurn(convo.id, [
    { role: "user", parts: textPart("one") },
    { role: "assistant", parts: textPart("1") },
    { role: "user", parts: textPart("two") },
  ]);

  const rows = listMessages(convo.id);
  assert.deepEqual(
    rows.map((r) => [r.role, r.parts[0].text]),
    [
      ["user", "one"],
      ["assistant", "1"],
      ["user", "two"],
    ],
    "a normal turn must leave history intact"
  );
});

test("transcript: truncateMessagesTo(0) clears the conversation and nothing else", () => {
  const keep = createConversation({ title: "keep", model: "m", provider: "p" });
  const wipe = createConversation({ title: "wipe", model: "m", provider: "p" });

  appendMessage({
    conversationId: keep.id,
    role: "user",
    parts: textPart("mine"),
    status: "complete",
  });
  appendMessage({
    conversationId: wipe.id,
    role: "user",
    parts: textPart("doomed"),
    status: "complete",
  });

  assert.equal(truncateMessagesTo(wipe.id, 0), 1);
  assert.equal(listMessages(wipe.id).length, 0);
  assert.equal(
    listMessages(keep.id).length,
    1,
    "truncation must be scoped to its own conversation"
  );
});
