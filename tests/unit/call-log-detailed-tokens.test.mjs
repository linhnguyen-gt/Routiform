import test from "node:test";
import assert from "node:assert/strict";

const {
  getPromptCacheReadTokensOrNull,
  getPromptCacheCreationTokensOrNull,
  getReasoningTokensOrNull,
} = await import("../../src/lib/usage/tokenAccounting.ts");

test("detailed tokens: returns null when provider does not report breakdown", () => {
  const usage = { prompt_tokens: 100, completion_tokens: 20 };

  assert.equal(getPromptCacheReadTokensOrNull(usage), null);
  assert.equal(getPromptCacheCreationTokensOrNull(usage), null);
  assert.equal(getReasoningTokensOrNull(usage), null);
});

test("detailed tokens: preserves explicit zero values", () => {
  const usage = {
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_tokens: 0,
  };

  assert.equal(getPromptCacheReadTokensOrNull(usage), 0);
  assert.equal(getPromptCacheCreationTokensOrNull(usage), 0);
  assert.equal(getReasoningTokensOrNull(usage), 0);
});

test("detailed tokens: reads Responses output_tokens_details.reasoning_tokens", () => {
  assert.equal(
    getReasoningTokensOrNull({
      input_tokens: 32028,
      output_tokens: 155,
      output_tokens_details: { reasoning_tokens: 81 },
    }),
    81
  );
});

test("detailed tokens: supports openrouter cache_write_tokens field", () => {
  const usage = {
    prompt_tokens_details: {
      cache_write_tokens: 321,
    },
  };

  assert.equal(getPromptCacheCreationTokensOrNull(usage), 321);
});
