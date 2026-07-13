import test from "node:test";
import assert from "node:assert/strict";

// NOTE: These tests call claudeToOpenAIResponse() directly with a hand-built
// `state`, exercising ONLY the translator's own internal merge logic in
// isolation. They do NOT go through open-sse/utils/stream.ts, which is where
// the real translate-mode cost-undercharge bug lived: `state.usage =
// extractUsage(parsed)` (a destructive overwrite, now fixed to a non-destructive
// merge — see mergeUsageNonDestructive in stream.ts) clobbered this exact
// merge's input before it ever ran. A hand-built state can never reproduce
// that. For end-to-end proof through the real pipeline with hand-computed
// final cost, see tests/unit/claude-to-openai-stream-cost-e2e.test.mjs.
const { claudeToOpenAIResponse } =
  await import("../../open-sse/translator/response/claude-to-openai.ts");

function freshState() {
  return {
    messageId: null,
    model: null,
    toolCallIndex: 0,
    toolCalls: new Map(),
    usage: null,
    finishReason: null,
    finishReasonSent: false,
  };
}

test("claude-to-openai stream: message_start captures input + cache usage", () => {
  const state = freshState();

  claudeToOpenAIResponse(
    {
      type: "message_start",
      message: {
        id: "msg_1",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 120,
          output_tokens: 0,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 800,
        },
      },
    },
    state
  );

  assert.equal(state.usage.input_tokens, 120);
  assert.equal(state.usage.cache_read_input_tokens, 5000);
  assert.equal(state.usage.cache_creation_input_tokens, 800);
});

test("claude-to-openai stream: message_delta merges output without dropping input/cache", () => {
  const state = freshState();

  claudeToOpenAIResponse(
    {
      type: "message_start",
      message: {
        id: "msg_2",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 200,
          output_tokens: 0,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 0,
        },
      },
    },
    state
  );

  // message_delta from Anthropic only carries output_tokens by design.
  claudeToOpenAIResponse(
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 42 },
    },
    state
  );

  assert.equal(state.usage.input_tokens, 200, "input_tokens must survive message_delta");
  assert.equal(state.usage.output_tokens, 42);
  assert.equal(state.usage.cache_read_input_tokens, 1000, "cache read must survive message_delta");
});

test("claude-to-openai stream: final chunk reports non-zero prompt_tokens and cache fields", () => {
  const state = freshState();

  claudeToOpenAIResponse(
    {
      type: "message_start",
      message: {
        id: "msg_3",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 300,
          output_tokens: 0,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 100,
        },
      },
    },
    state
  );

  const results = claudeToOpenAIResponse(
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 10 },
    },
    state
  );

  const finalChunk = results.find((r) => r.usage);
  assert.ok(finalChunk, "expected a chunk carrying usage");
  // prompt_tokens = input_tokens + cache_read + cache_creation = 300 + 2000 + 100
  assert.equal(finalChunk.usage.prompt_tokens, 2400);
  assert.equal(finalChunk.usage.completion_tokens, 10);
  assert.equal(finalChunk.usage.prompt_tokens_details.cached_tokens, 2000);
  assert.equal(finalChunk.usage.prompt_tokens_details.cache_creation_tokens, 100);
});

test("claude-to-openai stream: without message_start usage, delta output alone does not crash", () => {
  const state = freshState();

  const results = claudeToOpenAIResponse(
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 5 },
    },
    state
  );

  const finalChunk = results.find((r) => r.usage);
  assert.ok(finalChunk);
  assert.equal(finalChunk.usage.completion_tokens, 5);
  assert.equal(finalChunk.usage.prompt_tokens, 0);
});
