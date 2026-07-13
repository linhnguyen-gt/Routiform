/**
 * Regression: reasoning_effort:"max" is never in OpenAI's reasoning_effort
 * enum (max tops out at "xhigh" for providers that support it, "high"
 * otherwise). extractToolNameMapAndTuneTranslatedBody previously only
 * downgraded "xhigh" -> "high"; "max" reached OpenAI-format providers
 * verbatim and they returned HTTP 400 "max effort not support".
 */

import test from "node:test";
import assert from "node:assert/strict";

const { extractToolNameMapAndTuneTranslatedBody } =
  await import("../../open-sse/handlers/chat-core/chat-core-post-translate-tune.ts");

function tune(translatedBody, provider) {
  return extractToolNameMapAndTuneTranslatedBody({
    translatedBody,
    body: {},
    isClaudePassthrough: false,
    effectiveModel: "gpt-5",
    provider,
    model: "gpt-5",
    log: null,
  });
}

test('reasoning_effort:"max" is clamped to "xhigh" for a provider that supports xhigh', () => {
  const translatedBody = { reasoning_effort: "max" };
  tune(translatedBody, "claude");
  assert.equal(translatedBody.reasoning_effort, "xhigh");
});

test('reasoning_effort:"max" is clamped to "high" for a provider that does not support xhigh', () => {
  const translatedBody = { reasoning_effort: "max" };
  tune(translatedBody, "openai");
  assert.equal(translatedBody.reasoning_effort, "high");
});

test('reasoning_effort:"xhigh" downgrade behavior is unchanged for unsupported providers', () => {
  const translatedBody = { reasoning_effort: "xhigh" };
  tune(translatedBody, "openai");
  assert.equal(translatedBody.reasoning_effort, "high");
});

test('reasoning_effort:"xhigh" passes through unchanged for a provider that supports it', () => {
  const translatedBody = { reasoning_effort: "xhigh" };
  tune(translatedBody, "claude");
  assert.equal(translatedBody.reasoning_effort, "xhigh");
});

test("reasoning_effort is stripped entirely for providers with no reasoning_effort support", () => {
  const translatedBody = { reasoning_effort: "max" };
  tune(translatedBody, "mistral");
  assert.equal("reasoning_effort" in translatedBody, false);
});
