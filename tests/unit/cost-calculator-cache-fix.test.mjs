import test from "node:test";
import assert from "node:assert/strict";

const { computeCostFromPricing } = await import("../../src/lib/usage/costCalculator.ts");
const { getPricingForModel } = await import("../../src/shared/constants/pricing.ts");
const { claudeToOpenAIResponse } =
  await import("../../open-sse/translator/response/claude-to-openai.ts");

const PRICING = {
  input: 3.0,
  output: 15.0,
  cached: 1.5,
  reasoning: 22.5,
  cache_creation: 3.0,
};

test("computeCostFromPricing: uncached request bills full input + output rate", () => {
  const tokens = {
    prompt_tokens: 1000,
    completion_tokens: 500,
  };

  // 1000 * 3.00/1e6 + 500 * 15.00/1e6
  const expected = 1000 * (3.0 / 1_000_000) + 500 * (15.0 / 1_000_000);

  assert.equal(computeCostFromPricing(PRICING, tokens), expected);
  assert.ok(Math.abs(computeCostFromPricing(PRICING, tokens) - 0.0105) < 1e-9);
});

test("computeCostFromPricing: cache-inclusive prompt_tokens is not double-billed", () => {
  // prompt_tokens is cache-inclusive (input + cache_read + cache_creation), per
  // src/lib/usage/tokenAccounting.ts:getLoggedInputTokens.
  const tokens = {
    prompt_tokens: 10000,
    cache_read_input_tokens: 6000,
    cache_creation_input_tokens: 2000,
    completion_tokens: 1000,
  };

  // non-cached input = 10000 - 6000 - 2000 = 2000
  const expected =
    2000 * (3.0 / 1_000_000) + // non-cached input
    6000 * (1.5 / 1_000_000) + // cache read
    2000 * (3.0 / 1_000_000) + // cache creation
    1000 * (15.0 / 1_000_000); // output

  const actual = computeCostFromPricing(PRICING, tokens);
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
  assert.ok(Math.abs(actual - 0.036) < 1e-9);

  // Regression guard: the pre-fix formula (nonCachedInput = input - cachedTokens only)
  // would have produced 0.042, over-billing cache_creation tokens a second time.
  const buggyNonCachedInput = 10000 - 6000;
  const buggyCost =
    buggyNonCachedInput * (3.0 / 1_000_000) +
    6000 * (1.5 / 1_000_000) +
    2000 * (3.0 / 1_000_000) +
    1000 * (15.0 / 1_000_000);
  assert.notEqual(actual, buggyCost);
});

// --- C1 regression: cache-EXCLUSIVE Anthropic shapes must not be undercharged ---
//
// A prior fix subtracted cache_read/cache_creation from prompt_tokens
// unconditionally, assuming prompt_tokens is always cache-INCLUSIVE. That's true
// for OpenAI's prompt_tokens (tested above) but FALSE for Anthropic's native
// input_tokens, which is cache-EXCLUSIVE. Because that formula floors negative
// results to 0, any exclusive-shaped Claude usage object billed its non-cached
// input tokens at $0.

test("computeCostFromPricing: Anthropic-native input_tokens (cache-exclusive) bills non-cached input at full rate", () => {
  // Mirrors the raw shape written by
  // open-sse/translator/response/claude-to-openai.ts's message_start/message_delta
  // handlers: input_tokens is Anthropic's raw, cache-EXCLUSIVE input count;
  // cache_read/cache_creation are separate, additive buckets — never subsets of it.
  const tokens = {
    input_tokens: 3000,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 5000,
    output_tokens: 200,
  };

  const expected =
    3000 * (3.0 / 1_000_000) + // non-cached input — must stay 3000, never clamp to 0
    5000 * (3.0 / 1_000_000) + // cache creation, billed at its own rate
    200 * (15.0 / 1_000_000); // output

  const actual = computeCostFromPricing(PRICING, tokens);
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

  // Regression guard: the C1 bug (`nonCachedInput = input_tokens - cache_read -
  // cache_creation`, treating an already-exclusive value as inclusive) floors
  // non-cached input to max(0, 3000 - 0 - 5000) = 0, undercharging by 3000 tokens.
  const buggyCost = 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.notEqual(actual, buggyCost);
});

test("stream path: claude-to-openai state.usage feeds calculateCost with the correct, non-undercharged cost", () => {
  // End-to-end through the real, unmocked stream translator that the live
  // streaming path uses (open-sse/utils/stream.ts -> onComplete -> calculateCost
  // in open-sse/handlers/chat-core/chat-core-phase-streaming.ts ships exactly this
  // state.usage object to computeCostFromPricing).
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

  const state = freshState();

  claudeToOpenAIResponse(
    {
      type: "message_start",
      message: {
        id: "msg_c1",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 3000,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 5000,
        },
      },
    },
    state
  );
  claudeToOpenAIResponse(
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 200 } },
    state
  );

  const cost = computeCostFromPricing(PRICING, state.usage);
  const expected = 3000 * (3.0 / 1_000_000) + 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.ok(Math.abs(cost - expected) < 1e-9, `expected ${expected}, got ${cost}`);

  // Pre-fix behavior would have floored non-cached input to 0.
  const buggyCost = 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.notEqual(cost, buggyCost);
});

test("computeCostFromPricing: zero cache fields behave like a plain uncached call", () => {
  const tokens = {
    prompt_tokens: 5000,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    completion_tokens: 200,
  };

  const expected = 5000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  assert.ok(Math.abs(computeCostFromPricing(PRICING, tokens) - expected) < 1e-9);
});

test("pricing table: OpenAI gpt-5 family reflects verified live rates", () => {
  assert.deepEqual(getPricingForModel("cx", "gpt-5"), {
    input: 1.25,
    output: 10.0,
    cached: 0.125,
    reasoning: 15.0,
    cache_creation: 1.25,
  });
  assert.deepEqual(getPricingForModel("cx", "gpt-5.1"), {
    input: 1.25,
    output: 10.0,
    cached: 0.125,
    reasoning: 15.0,
    cache_creation: 1.25,
  });
  assert.deepEqual(getPricingForModel("cx", "gpt-5.2"), {
    input: 1.75,
    output: 14.0,
    cached: 0.175,
    reasoning: 21.0,
    cache_creation: 1.75,
  });
  assert.deepEqual(getPricingForModel("cx", "gpt-5.3-codex"), {
    input: 1.75,
    output: 14.0,
    cached: 0.175,
    reasoning: 21.0,
    cache_creation: 1.75,
  });
  assert.ok(getPricingForModel("cx", "gpt-5-mini"), "missing cx/gpt-5-mini");
  assert.ok(getPricingForModel("cx", "gpt-5.6-luna"), "missing cx/gpt-5.6-luna");
  assert.ok(getPricingForModel("cx", "gpt-5.6-terra"), "missing cx/gpt-5.6-terra");
  assert.ok(getPricingForModel("cx", "gpt-5.6-sol"), "missing cx/gpt-5.6-sol");
  assert.ok(getPricingForModel("cc", "claude-fable-5"), "missing cc/claude-fable-5");
});

test("pricing table: invented bare gpt-5.6 (no tier suffix) has been removed", () => {
  // Only luna/terra/sol are documented at developers.openai.com/api/docs/pricing.
  // A bare "gpt-5.6" was previously invented by guessing at the "terra" tier's
  // price — a guessed price is worse than a missing one.
  assert.equal(getPricingForModel("cx", "gpt-5.6"), null);
});
