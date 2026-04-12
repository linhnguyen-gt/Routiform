import test from "node:test";
import assert from "node:assert/strict";

const { normalizeUsage, extractUsage } = await import("../../open-sse/utils/usageTracking.ts");

test("normalizeUsage preserves nested prompt and completion token details", () => {
  const usage = normalizeUsage({
    prompt_tokens: 100,
    completion_tokens: 20,
    prompt_tokens_details: {
      cached_tokens: 15,
      cache_creation_tokens: 4,
      cache_write_tokens: 4,
    },
    completion_tokens_details: {
      reasoning_tokens: 7,
    },
  });

  assert.deepEqual(usage.prompt_tokens_details, {
    cached_tokens: 15,
    cache_creation_tokens: 4,
    cache_write_tokens: 4,
  });
  assert.deepEqual(usage.completion_tokens_details, {
    reasoning_tokens: 7,
  });
});

test("extractUsage preserves nested details from OpenAI Responses usage payloads", () => {
  const usage = extractUsage({
    type: "response.completed",
    response: {
      usage: {
        input_tokens: 120,
        output_tokens: 30,
        input_tokens_details: {
          cached_tokens: 11,
          cache_creation_tokens: 5,
        },
        output_tokens_details: {
          reasoning_tokens: 9,
        },
      },
    },
  });

  assert.equal(usage.prompt_tokens, 120);
  assert.equal(usage.completion_tokens, 30);
  assert.deepEqual(usage.prompt_tokens_details, {
    cached_tokens: 11,
    cache_creation_tokens: 5,
  });
  assert.deepEqual(usage.completion_tokens_details, {
    reasoning_tokens: 9,
  });
});
