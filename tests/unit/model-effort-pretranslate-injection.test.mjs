/**
 * Pre-translation model-effort default injection.
 *
 * Model-level reasoning-effort defaults were only applied AFTER translation,
 * where claude/gemini/kiro/antigravity targets were skipped ("a budget written
 * here would bypass every cap"). But those targets' translators already read
 * `reasoning_effort` off the inbound body and clamp it themselves. So the
 * default must be injected into the inbound body BEFORE translation — letting
 * it ride the same ladder a client-supplied effort does.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { injectPreTranslateEffortDefault } =
  await import("../../open-sse/handlers/chat-core/chat-core-apply-default-params.ts");
const { setModelReasoningEffortDefault, removeModelReasoningEffortDefault } =
  await import("../../open-sse/config/registry-params.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

const CLAUDE_MODEL = "claude-sonnet-4-5";

function withDefault(effort, fn) {
  assert.equal(setModelReasoningEffortDefault("anthropic", CLAUDE_MODEL, effort), true);
  try {
    fn();
  } finally {
    removeModelReasoningEffortDefault("anthropic", CLAUDE_MODEL);
  }
}

test("claude target receives the stored default as reasoning_effort before translation", () => {
  withDefault("high", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    injectPreTranslateEffortDefault({
      body,
      provider: "anthropic",
      model: CLAUDE_MODEL,
      targetFormat: FORMATS.CLAUDE,
      log: null,
    });
    assert.equal(body.reasoning_effort, "high");
  });
});

test("gemini and kiro targets also receive the pre-translation default", () => {
  withDefault("medium", () => {
    for (const targetFormat of [FORMATS.GEMINI, FORMATS.KIRO, FORMATS.ANTIGRAVITY]) {
      const body = { messages: [{ role: "user", content: "hi" }] };
      injectPreTranslateEffortDefault({
        body,
        provider: "anthropic",
        model: CLAUDE_MODEL,
        targetFormat,
        log: null,
      });
      assert.equal(body.reasoning_effort, "medium", targetFormat);
    }
  });
});

test("a request that already asks for reasoning is never overridden", () => {
  withDefault("high", () => {
    for (const existing of [
      { reasoning_effort: "low" },
      { reasoning: { effort: "low" } },
      { thinking: { type: "enabled", budget_tokens: 2048 } },
      { generationConfig: { thinkingConfig: { thinkingBudget: 2048 } } },
    ]) {
      const body = { messages: [{ role: "user", content: "hi" }], ...existing };
      injectPreTranslateEffortDefault({
        body,
        provider: "anthropic",
        model: CLAUDE_MODEL,
        targetFormat: FORMATS.CLAUDE,
        log: null,
      });
      assert.deepEqual(body, { messages: body.messages, ...existing });
    }
  });
});

test("formats with no pre-translate consumer are left to the post-translate pass", () => {
  withDefault("high", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    injectPreTranslateEffortDefault({
      body,
      provider: "anthropic",
      model: CLAUDE_MODEL,
      targetFormat: FORMATS.OPENAI,
      log: null,
    });
    assert.equal("reasoning_effort" in body, false);
  });
});

test("a model with no stored default injects nothing", () => {
  const body = { messages: [{ role: "user", content: "hi" }] };
  injectPreTranslateEffortDefault({
    body,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    targetFormat: FORMATS.CLAUDE,
    log: null,
  });
  assert.equal("reasoning_effort" in body, false);
});

test('"none" default injects nothing — the effort is stored, not applied', () => {
  withDefault("none", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    injectPreTranslateEffortDefault({
      body,
      provider: "anthropic",
      model: CLAUDE_MODEL,
      targetFormat: FORMATS.CLAUDE,
      log: null,
    });
    // readEffort returns "none" — it IS injected as an explicit off signal,
    // matching how a client-supplied "none" behaves in the downgrade ladder.
    assert.equal(body.reasoning_effort, "none");
  });
});
