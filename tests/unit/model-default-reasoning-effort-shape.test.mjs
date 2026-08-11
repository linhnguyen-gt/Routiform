/**
 * Regression: model-level reasoning-effort defaults are stored in the Responses-API
 * shape (`reasoning: { effort }`) but were copied verbatim onto an already-translated
 * request body. Only Codex and the Responses API read that field, so on every plain
 * OpenAI-format provider (DeepSeek, GitHub, ...) the default was sent as a top-level
 * object nobody reads and the effort silently never applied. Being injected after the
 * post-translation pass, it also skipped the max -> xhigh -> high downgrade ladder.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { applyModelDefaultParams } =
  await import("../../open-sse/handlers/chat-core/chat-core-apply-default-params.ts");

function apply(body, effort, targetFormat, provider) {
  applyModelDefaultParams({
    body,
    defaultParams: { reasoning: { effort } },
    targetFormat,
    provider,
    log: null,
  });
  return body;
}

test("openai-format provider receives the effort as flat reasoning_effort", () => {
  const body = apply({ model: "deepseek-reasoner" }, "high", "openai", "deepseek");
  assert.equal(body.reasoning_effort, "high");
  assert.equal("reasoning" in body, false);
});

test("openai-format default goes through the provider downgrade ladder", () => {
  assert.equal(apply({}, "max", "openai", "openai").reasoning_effort, "high");
  assert.equal(apply({}, "max", "openai", "claude").reasoning_effort, "xhigh");
});

test('deepseek keeps "max", which is a real level in its own enum', () => {
  assert.equal(apply({}, "max", "openai", "deepseek").reasoning_effort, "max");
});

test("deepseek levels outside its enum are mapped onto it, not passed through", () => {
  // DeepSeek V4 accepts only low/high/max.
  assert.equal(apply({}, "medium", "openai", "deepseek").reasoning_effort, "high");
  assert.equal(apply({}, "xhigh", "openai", "deepseek").reasoning_effort, "high");
  assert.equal(apply({}, "low", "openai", "deepseek").reasoning_effort, "low");
  assert.equal(apply({}, "high", "openai", "deepseek").reasoning_effort, "high");
});

test('"none" turns reasoning off rather than being rounded up to a provider\'s lowest level', () => {
  const body = apply({}, "none", "openai", "deepseek");
  assert.equal("reasoning_effort" in body, false);
});

test("openai-format default is skipped for providers with no reasoning_effort support", () => {
  const body = apply({}, "high", "openai", "mistral");
  assert.equal("reasoning_effort" in body, false);
  assert.equal("reasoning" in body, false);
});

test("codex keeps the nested reasoning.effort shape its transform reads", () => {
  const body = apply({}, "xhigh", "codex", "codex");
  assert.deepEqual(body.reasoning, { effort: "xhigh" });
  assert.equal("reasoning_effort" in body, false);
});

test("claude-format is left untouched: a budget written here would bypass every cap", () => {
  // Thinking budgets have to be clamped against the model's thinkingBudgetCap, its
  // maxOutputTokens and the provider token cap. All three passes run upstream of this
  // one, so writing a budget here reaches Anthropic unclamped and 400s.
  const body = apply({ max_tokens: 4096, temperature: 0.7 }, "high", "claude", "claude");
  assert.equal("thinking" in body, false);
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.temperature, 0.7);
  assert.equal("reasoning" in body, false);
  assert.equal("reasoning_effort" in body, false);
});

test("formats with their own reasoning shape get no injected field at all", () => {
  const body = apply({ generationConfig: {} }, "high", "gemini", "gemini");
  assert.equal("reasoning" in body, false);
  assert.equal("reasoning_effort" in body, false);
  assert.equal("thinking" in body, false);
});

test("a default never overrides an effort the request already carries", () => {
  assert.equal(
    apply({ reasoning_effort: "low" }, "high", "openai", "deepseek").reasoning_effort,
    "low"
  );
  assert.deepEqual(apply({ reasoning: { effort: "low" } }, "high", "codex", "codex").reasoning, {
    effort: "low",
  });
  assert.equal(
    "reasoning_effort" in apply({ reasoning_effort: "low" }, "high", "openai", "openai"),
    true
  );
});

test("non-reasoning defaults are still copied, and never over an existing value", () => {
  const body = { temperature: 0.2 };
  applyModelDefaultParams({
    body,
    defaultParams: { temperature: 1, top_p: 0.9 },
    targetFormat: "openai",
    provider: "deepseek",
    log: null,
  });
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.9);
});
