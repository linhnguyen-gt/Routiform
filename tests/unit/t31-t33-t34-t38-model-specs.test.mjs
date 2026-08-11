import test from "node:test";
import assert from "node:assert/strict";

const { REGISTRY: _REGISTRY } = await import("../../open-sse/config/providerRegistry.ts");
const { getStaticModelsForProvider } =
  await import("../../src/app/api/providers/[id]/models/route.ts");
const { resolveModelAlias: resolveDeprecatedAlias } =
  await import("../../open-sse/services/modelDeprecation.ts");
const { normalizeThinkingLevel } = await import("../../open-sse/services/thinkingBudget.ts");
const {
  MODEL_SPECS,
  getModelSpec,
  capMaxOutputTokens,
  resolveSpecAlias,
  getDefaultThinkingBudget,
  capThinkingBudget,
  SAFE_DEFAULT_MAX_OUTPUT_TOKENS,
} = await import("../../src/shared/constants/modelSpecs.ts");

test("T31: antigravity provider route is the only catalog source", () => {
  assert.equal(getStaticModelsForProvider("antigravity"), undefined);
});

test("T31: legacy Gemini aliases resolve to Gemini 3.1 IDs", () => {
  assert.equal(resolveDeprecatedAlias("gemini-3-pro-high"), "gemini-3.1-pro-high");
  assert.equal(resolveDeprecatedAlias("gemini-3-pro-low"), "gemini-3.1-pro-low");
  assert.equal(resolveDeprecatedAlias("gemini-3.1-flash-image"), "gemini-3.5-flash-low");
});

test("T33: thinkingLevel string is converted into numeric thinkingBudget", () => {
  const converted = normalizeThinkingLevel({
    model: "gemini-3.1-pro-high",
    generationConfig: {
      thinkingConfig: { thinkingLevel: "HIGH" },
    },
  });

  assert.equal(converted.generationConfig.thinkingConfig.thinkingBudget, 24576);
  assert.equal(converted.generationConfig.thinkingConfig.thinkingLevel, undefined);
});

test("T34: max output tokens are capped by model spec", () => {
  assert.equal(capMaxOutputTokens("gemini-3-flash", 131072), 65536);
  assert.equal(capMaxOutputTokens("gemini-3.5-flash", 131072), 65536);
  assert.equal(capMaxOutputTokens("gemini-3.1-pro-high", 131072), 65535);
});

// HIGH 6 (fixed): capMaxOutputTokens(model) with NO explicit client
// max_tokens must never silently hand out the model's full ceiling — it
// should apply the safe default cap instead (see modelSpecs.ts), even
// though the model's real registered cap is much larger (65536/65535).
test("HIGH 6: no explicit max_tokens applies the safe default cap, not the full model ceiling", () => {
  assert.equal(capMaxOutputTokens("gemini-3-flash"), SAFE_DEFAULT_MAX_OUTPUT_TOKENS);
  assert.equal(capMaxOutputTokens("gemini-3.5-flash"), SAFE_DEFAULT_MAX_OUTPUT_TOKENS);
  assert.equal(capMaxOutputTokens("gemini-3.1-pro-high"), SAFE_DEFAULT_MAX_OUTPUT_TOKENS);
  // An unregistered model's __default__ cap (8192) is already below the
  // safe default, so it is untouched.
  assert.equal(capMaxOutputTokens("some-unregistered-model"), 8192);
});

// LOW 9 (fixed): an explicit `max_tokens: 0` is a valid (if unusual) client
// request and must be honored literally, not treated as "no request" and
// silently upgraded to the full cap.
test("LOW 9: an explicit max_tokens: 0 is honored, not treated as absent", () => {
  assert.equal(capMaxOutputTokens("gemini-2.5-pro", 0), 0);
});

test("T38: modelSpecs exposes centralized helpers with alias and prefix lookup", () => {
  assert.equal(typeof MODEL_SPECS["gemini-3.1-pro-high"], "object");
  assert.equal(getModelSpec("gemini-3-pro-high").maxOutputTokens, 65535);
  assert.equal(getModelSpec("gemini-3-flash-preview").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.5-flash").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.5-flash-low").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.1-flash-image").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.1-pro-preview").maxOutputTokens, 65535);
  assert.equal(getModelSpec("gemini-3.1-pro-preview-customtools").maxOutputTokens, 65535);
  assert.equal(resolveSpecAlias("gemini-3-pro-low"), "gemini-3.1-pro-low");
  assert.equal(resolveSpecAlias("gemini-3.1-pro-preview"), "gemini-3.1-pro-high");
  assert.equal(resolveSpecAlias("gemini-3.1-pro-preview-customtools"), "gemini-3.1-pro-high");
  assert.equal(getDefaultThinkingBudget("gemini-3.1-pro-high"), 24576);
  assert.equal(capThinkingBudget("gemini-3.1-pro-low", 50000), 16000);
});

// MEDIUM 7 (fixed): longest-prefix-wins classification. Previously,
// Object.entries insertion order decided which MODEL_SPECS prefix matched
// first; "gemini-2.5-flash" (inserted before "gemini-2.5-flash-lite")
// incorrectly won for any "gemini-2.5-flash-lite*" id.
test("MEDIUM 7: longest-prefix match — flash-lite variants never resolve to plain flash", () => {
  const liteSpec = getModelSpec("gemini-2.5-flash-lite-preview-06-17");
  assert.equal(liteSpec.thinkingBudgetCap, 24576);
  assert.equal(liteSpec.minThinkingBudgetWhenEnabled, 512);
  assert.deepEqual(liteSpec, getModelSpec("gemini-2.5-flash-lite"));
});

// HIGH 5 (fixed): gemini-2.5-pro's defaultThinkingBudget was 128 — the
// MINIMUM enabled budget, not a sane "medium effort" default.
test("HIGH 5: gemini-2.5-pro's default thinking budget is not its mandatory minimum", () => {
  const spec = getModelSpec("gemini-2.5-pro");
  assert.equal(spec.defaultThinkingBudget, 8192);
  assert.equal(spec.minThinkingBudgetWhenEnabled, 128);
  assert.notEqual(spec.defaultThinkingBudget, spec.minThinkingBudgetWhenEnabled);
});

test("T38: GPT-5 family uses the 400k / 128k OpenAI limits", () => {
  const gpt54 = getModelSpec("gpt-5.4");
  const gpt5Codex = getModelSpec("gpt-5.3-codex");
  const gpt5Mini = getModelSpec("gpt-5-mini");

  assert.equal(gpt54.contextWindow, 400000);
  assert.equal(gpt54.maxOutputTokens, 128000);
  assert.equal(gpt5Codex.contextWindow, 400000);
  assert.equal(gpt5Codex.maxOutputTokens, 128000);
  assert.equal(gpt5Mini.contextWindow, 400000);
  assert.equal(gpt5Mini.maxOutputTokens, 128000);
  assert.equal(getModelSpec("gpt-5").contextWindow, 400000);
});

// ─── Provider-qualified model ids ───────────────────────────────────────────
// The routing layer stamps `provider/model` onto the request body, and the
// callers that read the id off the body hand that string straight to the spec
// lookup. No canonical key or alias contains "/", so every ceiling those
// callers apply used to resolve to "no limit".

test("a provider-qualified id resolves to the same spec as its bare form", () => {
  const bare = getModelSpec("claude-opus-4-5");
  assert.ok(bare, "precondition: the bare id has a spec");

  assert.deepEqual(getModelSpec("anthropic/claude-opus-4-5"), bare);
  assert.deepEqual(getModelSpec("openrouter/anthropic/claude-opus-4-5"), bare);
  assert.deepEqual(getModelSpec("anthropic/gemini-3.1-pro-preview"), getModelSpec("gemini-3.1-pro-high"));
});

test("the thinking caps apply to a provider-qualified id", () => {
  assert.equal(capThinkingBudget("claude-opus-4-5", 60000), 32000);
  assert.equal(capThinkingBudget("anthropic/claude-opus-4-5", 60000), 32000);
  assert.equal(getDefaultThinkingBudget("anthropic/claude-opus-4-5"), 10000);
  assert.equal(capMaxOutputTokens("anthropic/claude-opus-4-5", 131072), 32768);
});

test("the segment retry only fires when the whole id matched nothing", () => {
  // An id that already resolves is never reinterpreted, so nothing that worked
  // before can change meaning.
  assert.equal(getModelSpec("provider/some-unregistered-model"), undefined);
  assert.equal(getModelSpec("no-slash-unregistered"), undefined);
  assert.equal(getModelSpec("trailing/"), undefined);
  assert.equal(capThinkingBudget("provider/some-unregistered-model", 60000), 60000);
});
