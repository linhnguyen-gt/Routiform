import test from "node:test";
import assert from "node:assert/strict";

/**
 * The conversation identity feeding EngineContext.
 *
 * The failure this file exists to prevent is subtle: `resolveClaudeCodeCompatibleSessionId`
 * returns `randomUUID()` when no header is present. Reusing it here would have produced a field
 * that looks like an identity, type-checks as one, and silently guarantees every keyed lookup
 * misses — a dedup engine built on it would report a 0% hit rate and nobody would know whether
 * the engine or the key was at fault.
 */

const { resolveConversationId } = await import("../../open-sse/services/conversationIdentity.ts");

const conversation = () => ({
  model: "claude-sonnet-4",
  messages: [
    { role: "system", content: "You are a coding agent." },
    { role: "user", content: "fix the parser bug" },
  ],
});

test("an explicit session header wins", () => {
  const id = resolveConversationId({ "x-claude-code-session-id": "sess-abc" }, conversation());
  assert.equal(id, "sess-abc");
});

test("header matching is case-insensitive and covers every accepted spelling", () => {
  for (const name of [
    "X-Claude-Code-Session-Id",
    "x-session-id",
    "x_session_id",
    "x-routiform-session",
  ]) {
    assert.equal(resolveConversationId({ [name]: "sess-1" }, conversation()), "sess-1");
  }
});

test("a Headers instance works as well as a plain object", () => {
  const headers = new Headers({ "x-session-id": "sess-headers" });
  assert.equal(resolveConversationId(headers, conversation()), "sess-headers");
});

test("a blank header falls through to the fingerprint instead of returning empty", () => {
  const id = resolveConversationId({ "x-session-id": "   " }, conversation());
  assert.ok(id);
  assert.notEqual(id.trim(), "");
});

test("without a header, the same conversation resolves to the same id every time", () => {
  // This is the assertion that proves nothing is fabricated: a randomUUID fallback would make
  // these two differ, and every downstream lookup would miss forever.
  const first = resolveConversationId(null, conversation());
  const second = resolveConversationId(null, conversation());
  assert.ok(first);
  assert.equal(first, second);
});

test("a different conversation resolves to a different id", () => {
  const other = conversation();
  other.messages[1].content = "add a login page";
  assert.notEqual(resolveConversationId(null, conversation()), resolveConversationId(null, other));
});

test("two conversations sharing a system prompt do NOT collide", () => {
  // The defect that killed the prefix-hash design: keying on the system prompt alone collides
  // across every conversation a tenant runs, because agents send an identical system prompt.
  const a = conversation();
  const b = conversation();
  b.messages[1].content = "something entirely different";
  assert.notEqual(resolveConversationId(null, a), resolveConversationId(null, b));
});

test("the provider is part of the identity", () => {
  const withProvider = resolveConversationId(null, conversation(), { provider: "anthropic" });
  const without = resolveConversationId(null, conversation());
  assert.notEqual(withProvider, without);
});

test("null when the body carries nothing to fingerprint", () => {
  assert.equal(resolveConversationId(null, null), null);
  assert.equal(resolveConversationId(null, {}), null);
  assert.equal(resolveConversationId(undefined, undefined), null);
});

test("an array-valued header takes its first entry", () => {
  assert.equal(
    resolveConversationId({ "x-session-id": ["sess-first", "sess-second"] }, null),
    "sess-first"
  );
});
