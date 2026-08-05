import test from "node:test";
import assert from "node:assert/strict";

const { geminiToOpenAIResponse } =
  await import("../../open-sse/translator/response/gemini-to-openai.ts");

function freshState() {
  return { toolCalls: new Map() };
}

function chunkWithFinishReason(finishReason) {
  return {
    responseId: "resp-1",
    modelVersion: "gemini-3-pro",
    candidates: [{ content: { parts: [] }, finishReason }],
  };
}

// Every documented Gemini finishReason must land inside the OpenAI enum
// (stop | length | tool_calls | content_filter | function_call).
const CASES = [
  ["STOP", "stop"],
  ["MAX_TOKENS", "length"],
  ["SAFETY", "content_filter"],
  ["RECITATION", "content_filter"],
  ["BLOCKLIST", "content_filter"],
  ["PROHIBITED_CONTENT", "content_filter"],
  ["SPII", "content_filter"],
  ["MALFORMED_FUNCTION_CALL", "tool_calls"],
  ["OTHER", "stop"],
  ["FINISH_REASON_UNSPECIFIED", "stop"],
];

const OPENAI_FINISH_REASONS = new Set([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call",
]);

for (const [geminiValue, expected] of CASES) {
  test(`gemini finishReason ${geminiValue} maps to ${expected}`, () => {
    const state = freshState();
    const results = geminiToOpenAIResponse(chunkWithFinishReason(geminiValue), state);
    assert.ok(Array.isArray(results));
    const finalChunk = results[results.length - 1];
    assert.equal(finalChunk.choices[0].finish_reason, expected);
    assert.equal(state.finishReason, expected);
    assert.ok(OPENAI_FINISH_REASONS.has(finalChunk.choices[0].finish_reason));
  });
}

test("MAX_TOKENS never leaks the raw lowercased value", () => {
  const state = freshState();
  const results = geminiToOpenAIResponse(chunkWithFinishReason("MAX_TOKENS"), state);
  assert.ok(!JSON.stringify(results).includes("max_tokens"));
  assert.notEqual(state.finishReason, "max_tokens");
});

test("unmapped finishReason falls back to stop and warns naming the raw value", () => {
  const state = freshState();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const results = geminiToOpenAIResponse(chunkWithFinishReason("SOME_NEW_REASON"), state);
    assert.equal(results[results.length - 1].choices[0].finish_reason, "stop");
    assert.equal(state.finishReason, "stop");
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    warnings.some((line) => line.includes("SOME_NEW_REASON")),
    `expected a warning naming the raw value, got: ${JSON.stringify(warnings)}`
  );
});

test("tool-call promotion still wins over the STOP mapping", () => {
  const state = freshState();
  state.toolCalls.set(0, { id: "call_1", type: "function", function: { name: "f" } });
  const results = geminiToOpenAIResponse(chunkWithFinishReason("STOP"), state);
  assert.equal(results[results.length - 1].choices[0].finish_reason, "tool_calls");
  assert.equal(state.finishReason, "tool_calls");
});

test("tool-call promotion does not hijack a non-STOP reason", () => {
  const state = freshState();
  state.toolCalls.set(0, { id: "call_1", type: "function", function: { name: "f" } });
  const results = geminiToOpenAIResponse(chunkWithFinishReason("MAX_TOKENS"), state);
  assert.equal(results[results.length - 1].choices[0].finish_reason, "length");
});
