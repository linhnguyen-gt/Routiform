import test from "node:test";
import assert from "node:assert/strict";

import { dedupeConsecutiveMessages } from "../../open-sse/services/dedupeConsecutiveMessages.ts";

test("returns input unchanged when fewer than 2 messages", () => {
  const empty = dedupeConsecutiveMessages([]);
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.removed, 0);

  const single = dedupeConsecutiveMessages([{ role: "user", content: "hi" }]);
  assert.equal(single.messages.length, 1);
  assert.equal(single.removed, 0);
});

test("collapses identical adjacent user messages", () => {
  const { messages, removed } = dedupeConsecutiveMessages([
    { role: "system", content: "S" },
    { role: "user", content: "hello" },
    { role: "user", content: "hello" },
  ]);
  assert.equal(removed, 1);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "hello");
});

test("collapses 3+ adjacent user duplicates down to 1", () => {
  const { messages, removed } = dedupeConsecutiveMessages([
    { role: "user", content: "ping" },
    { role: "user", content: "ping" },
    { role: "user", content: "ping" },
    { role: "user", content: "ping" },
  ]);
  assert.equal(removed, 3);
  assert.equal(messages.length, 1);
});

test("does NOT collapse non-adjacent duplicates", () => {
  const input = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "hi" },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 0);
  assert.equal(messages.length, 3);
});

test("never collapses assistant messages even if adjacent and identical", () => {
  const input = [
    { role: "assistant", content: "ok" },
    { role: "assistant", content: "ok" },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 0);
  assert.equal(messages.length, 2);
});

test("never collapses system messages", () => {
  const input = [
    { role: "system", content: "you are helpful" },
    { role: "system", content: "you are helpful" },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 0);
  assert.equal(messages.length, 2);
});

test("collapses adjacent tool results with same tool_call_id and content", () => {
  const input = [
    { role: "assistant", content: "", tool_calls: [{ id: "t1" }] },
    { role: "tool", tool_call_id: "t1", content: "result-A" },
    { role: "tool", tool_call_id: "t1", content: "result-A" },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 1);
  assert.equal(messages.length, 2);
});

test("does NOT collapse tool results with different tool_call_id", () => {
  const input = [
    { role: "tool", tool_call_id: "t1", content: "ok" },
    { role: "tool", tool_call_id: "t2", content: "ok" },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 0);
  assert.equal(messages.length, 2);
});

test("collapses identical multi-modal user content arrays", () => {
  const block = [
    { type: "text", text: "look" },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
  ];
  const input = [
    { role: "user", content: block },
    { role: "user", content: block },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 1);
  assert.equal(messages.length, 1);
});

test("does NOT collapse multi-modal user content with different image data", () => {
  const input = [
    {
      role: "user",
      content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }],
    },
    {
      role: "user",
      content: [{ type: "image_url", image_url: { url: "data:image/png;base64,BBB" } }],
    },
  ];
  const { messages, removed } = dedupeConsecutiveMessages(input);
  assert.equal(removed, 0);
  assert.equal(messages.length, 2);
});

test("non-deduped role between matching user turns prevents accidental collapse", () => {
  // user A → assistant → user A : the assistant breaks the run, so neither
  // user A is collapsed against the other.
  const { messages, removed } = dedupeConsecutiveMessages([
    { role: "user", content: "x" },
    { role: "assistant", content: "thinking" },
    { role: "user", content: "x" },
  ]);
  assert.equal(removed, 0);
  assert.equal(messages.length, 3);
});

test("preserves message identity (does not deep-clone)", () => {
  const u1 = { role: "user", content: "same" };
  const u2 = { role: "user", content: "same" };
  const { messages, removed } = dedupeConsecutiveMessages([u1, u2]);
  assert.equal(removed, 1);
  assert.equal(messages.length, 1);
  assert.strictEqual(messages[0], u1);
});
