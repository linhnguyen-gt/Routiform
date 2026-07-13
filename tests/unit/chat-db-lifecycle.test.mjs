/**
 * Behavioural tests for the native-chat persistence layer.
 *
 * These target the three defects the red team found in the first draft of the
 * plan, each of which would have shipped silently:
 *   1. ON DELETE CASCADE is a no-op here (PRAGMA foreign_keys is never enabled),
 *      so deleting a conversation must remove its messages explicitly.
 *   2. A turn that crashes mid-stream is stuck at status='streaming' forever
 *      unless it is swept.
 *   3. Attachments are content-addressed, so the same bytes must not duplicate.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the DB at a throwaway dir BEFORE importing anything that touches it.
// src/lib/db/core.ts resolves SQLITE_FILE at module load from DATA_DIR, and
// getDbInstance() memoizes the handle — so setting this afterwards would
// silently write test rows into the developer's real ~/.routiform/storage.sqlite.
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-chat-test-"));
process.env.DATA_DIR = TMP_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";
process.env.NODE_ENV = "test";

test.after(() => {
  fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});

const {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation,
  appendMessage,
  listMessages,
  updateMessage,
  sweepInterruptedMessages,
  putAttachment,
  getAttachment,
} = await import("../../src/lib/db/chat.ts");

test("chat: conversation round-trips through SQLite", () => {
  const created = createConversation({
    model: "gpt-5",
    provider: "openai",
    systemPrompt: "be terse",
    title: "t",
  });

  const loaded = getConversation(created.id);
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.model, "gpt-5");
  assert.equal(loaded.provider, "openai");
  assert.equal(loaded.systemPrompt, "be terse");

  assert.ok(listConversations().some((c) => c.id === created.id));
});

test("chat: model/provider survive a reload (the picker-reset regression)", () => {
  // useProviderOptions force-resets the selection on mount, which is why the
  // chat does not reuse it. The persisted value must be authoritative.
  const conv = createConversation({ model: "claude-sonnet-4-6", provider: "anthropic" });
  updateConversation(conv.id, { model: "gpt-5.1", provider: "openai" });

  const reloaded = getConversation(conv.id);
  assert.equal(reloaded.model, "gpt-5.1");
  assert.equal(reloaded.provider, "openai");
});

test("chat: message parts survive a round-trip as structured data", () => {
  const conv = createConversation({ model: "gpt-5" });
  const parts = [
    { type: "text", text: "hello" },
    { type: "file", mediaType: "image/png", sha256: "abc" },
  ];

  appendMessage({ conversationId: conv.id, role: "user", parts });

  const [message] = listMessages(conv.id);
  assert.deepEqual(message.parts, parts, "parts must not be flattened to a string");
});

test("chat: deleting a conversation leaves ZERO orphaned messages", () => {
  // This DB never enables PRAGMA foreign_keys, so an ON DELETE CASCADE clause
  // would silently do nothing and every message row would survive forever —
  // still present in the file and in every backup export.
  const conv = createConversation({ model: "gpt-5" });
  appendMessage({ conversationId: conv.id, role: "user", parts: [{ type: "text", text: "a" }] });
  appendMessage({
    conversationId: conv.id,
    role: "assistant",
    parts: [{ type: "text", text: "b" }],
  });

  assert.equal(listMessages(conv.id).length, 2);

  assert.equal(deleteConversation(conv.id), true);
  assert.equal(getConversation(conv.id), null);
  assert.equal(listMessages(conv.id).length, 0, "messages were orphaned, not deleted");
});

test("chat: deleting a missing conversation reports false", () => {
  assert.equal(deleteConversation("does-not-exist"), false);
});

test("chat: a crashed turn is swept from 'streaming' to 'interrupted'", () => {
  // onFinish/onError never fire on a hard crash. Without the sweep the UI would
  // render a permanently pending turn and the user's prompt would look lost.
  const conv = createConversation({ model: "gpt-5" });
  const stale = appendMessage({
    conversationId: conv.id,
    role: "assistant",
    parts: [],
    status: "streaming",
  });

  // Sweep everything regardless of age.
  const swept = sweepInterruptedMessages(-1);
  assert.ok(swept >= 1);

  const [message] = listMessages(conv.id).filter((m) => m.id === stale.id);
  assert.equal(message.status, "interrupted");
});

test("chat: a fresh in-flight turn is NOT swept", () => {
  const conv = createConversation({ model: "gpt-5" });
  const live = appendMessage({
    conversationId: conv.id,
    role: "assistant",
    parts: [],
    status: "streaming",
  });

  sweepInterruptedMessages(5 * 60 * 1000);

  const [message] = listMessages(conv.id).filter((m) => m.id === live.id);
  assert.equal(message.status, "streaming", "swept a turn that was still streaming");
});

test("chat: updateMessage finalizes a streaming turn with usage", () => {
  const conv = createConversation({ model: "gpt-5" });
  const msg = appendMessage({
    conversationId: conv.id,
    role: "assistant",
    parts: [],
    status: "streaming",
  });

  updateMessage(msg.id, {
    parts: [{ type: "text", text: "done" }],
    status: "complete",
    requestId: "req-123",
    inputTokens: 57,
    outputTokens: 12,
  });

  const [message] = listMessages(conv.id).filter((m) => m.id === msg.id);
  assert.equal(message.status, "complete");
  assert.equal(message.requestId, "req-123");
  assert.equal(message.inputTokens, 57);
  assert.equal(message.outputTokens, 12);
  assert.deepEqual(message.parts, [{ type: "text", text: "done" }]);
});

test("chat: attachments are content-addressed and deduplicate", () => {
  const bytes = Buffer.from("the same image bytes");

  const first = putAttachment(bytes, "image/png");
  const second = putAttachment(bytes, "image/png");

  assert.equal(first.sha256, second.sha256, "same bytes must hash to the same id");

  const loaded = getAttachment(first.sha256);
  assert.equal(loaded.mime, "image/png");
  assert.equal(loaded.bytes, bytes.byteLength);
  assert.equal(loaded.data.toString(), bytes.toString());
});

test("chat: getAttachment returns null for an unknown hash", () => {
  assert.equal(getAttachment("nope"), null);
});
