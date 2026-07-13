import test from "node:test";
import assert from "node:assert/strict";

const { extractUsageFromResponse } = await import("../../open-sse/handlers/usageExtractor.ts");

// C1 regression: extractUsageFromResponse's "OpenAI Responses API" branch
// matches on `input_tokens`/`output_tokens` presence — the same field names
// Anthropic's native Messages API usage object uses. Because that branch was
// checked BEFORE the (correct) Claude-format branch below it, every non-stream
// Claude response body took the Responses-API path and got
// `prompt_tokens = input_tokens` verbatim (cache-EXCLUSIVE), instead of the
// correct `input_tokens + cache_read + cache_creation` (cache-INCLUSIVE) sum.
// That silently undercharged every cached/cache-creation Claude request.

test("extractUsageFromResponse: native Claude body sums input+cache into prompt_tokens (not the exclusive value)", () => {
  const responseBody = {
    id: "msg_test",
    type: "message",
    model: "claude-sonnet-4-6",
    usage: {
      input_tokens: 3000,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 5000,
    },
  };

  const usage = extractUsageFromResponse(responseBody, "claude");

  // 3000 (exclusive) + 0 (cache read) + 5000 (cache creation) = 8000
  assert.equal(usage.prompt_tokens, 8000, "prompt_tokens must be cache-inclusive, not 3000");
  assert.equal(usage.completion_tokens, 200);
  assert.equal(usage.cache_read_input_tokens, 0);
  assert.equal(usage.cache_creation_input_tokens, 5000);
});

test("extractUsageFromResponse: Claude body with no caching in use still sums correctly", () => {
  const responseBody = {
    usage: {
      input_tokens: 42,
      output_tokens: 7,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };

  const usage = extractUsageFromResponse(responseBody, "anthropic");

  assert.equal(usage.prompt_tokens, 42);
  assert.equal(usage.completion_tokens, 7);
});

test("extractUsageFromResponse: OpenAI Responses API body (no cache_creation_input_tokens) keeps the exclusive/inclusive-as-is behavior", () => {
  // Regression guard for the pre-existing plan3-p0.test.mjs assertion: a genuine
  // Responses-API-shaped body (e.g. from a GitHub Copilot proxy) has no
  // cache_creation_input_tokens field — OpenAI has no "cache write" billing
  // concept — so it must NOT be misclassified as a native Claude body.
  const responseBody = {
    object: "response",
    usage: {
      input_tokens: 20,
      output_tokens: 9,
      cache_read_input_tokens: 4,
      reasoning_tokens: 3,
    },
  };

  const usage = extractUsageFromResponse(responseBody, "github");

  assert.equal(usage.prompt_tokens, 20);
  assert.equal(usage.completion_tokens, 9);
  assert.equal(usage.cached_tokens, 4);
  assert.equal(usage.reasoning_tokens, 3);
});

test("extractUsageFromResponse: fixed shape feeds calculateCost with the correct (non-undercharged) cost", async () => {
  const { computeCostFromPricing } = await import("../../src/lib/usage/costCalculator.ts");

  const PRICING = { input: 3.0, output: 15.0, cached: 1.5, reasoning: 22.5, cache_creation: 3.0 };

  const responseBody = {
    usage: {
      input_tokens: 3000,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 5000,
    },
  };

  const usage = extractUsageFromResponse(responseBody, "claude");
  const cost = computeCostFromPricing(PRICING, usage);

  const expected = 3000 * (3.0 / 1_000_000) + 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.ok(Math.abs(cost - expected) < 1e-9, `expected ${expected}, got ${cost}`);

  const buggyCost = 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.notEqual(cost, buggyCost);
});
