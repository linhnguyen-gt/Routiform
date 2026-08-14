import test from "node:test";
import assert from "node:assert/strict";

/**
 * Gemini 3.7 Flash (launched 2026-08-13) and 3.6 Flash reach Routiform through
 * Antigravity's live `fetchAvailableModels` passthrough — there is no static
 * catalogue to add them to. What DOES have to be added is everything keyed off
 * the model id, and both were missing from it:
 *
 *   - MODEL_SPECS had no 3.6/3.7 entry, and lookupSpec's longest-prefix pass
 *     could not borrow the older "gemini-3-flash" one ("gemini-3.7-flash-high"
 *     does not start with "gemini-3-flash"). Every tier fell through to
 *     `__default__` and was capped at 8192 output instead of the published 65536.
 *   - agPricing had no entry, so every call billed $0.
 *
 * Published limits: 1M context / 64K output, thinking + tools + vision.
 *   https://ai.google.dev/gemini-api/docs/latest-model
 *   https://deepmind.google/models/model-cards/gemini-3-7-flash/
 */

const { getModelSpec, capMaxOutputTokens } =
  await import("../../src/shared/constants/modelSpecs.ts");
const { agPricing } = await import("../../src/shared/constants/pricing/ag-pricing.ts");
const { geminiPricing } = await import("../../src/shared/constants/pricing/gemini-pricing.ts");

// The live tier ids Antigravity advertises for a Flash generation.
const TIERS = ["", "-extra-low", "-low", "-medium", "-high", "-tiered"];
const GENERATIONS = ["gemini-3.7-flash", "gemini-3.6-flash"];

test("every 3.6/3.7 Flash tier resolves to the published 64K output ceiling", () => {
  for (const base of GENERATIONS) {
    for (const tier of TIERS) {
      const id = `${base}${tier}`;
      const spec = getModelSpec(id);
      assert.ok(spec, `${id} must resolve to a spec, not fall through to __default__`);
      assert.equal(spec.maxOutputTokens, 65536, `${id} output ceiling`);
      assert.equal(spec.contextWindow, 1048576, `${id} context window`);
    }
  }
});

test("the regression this fixes: the tier ids used to cap at the 8192 default", () => {
  // A client explicitly asking for more than 8192 now gets it, up to 65536.
  assert.equal(capMaxOutputTokens("gemini-3.7-flash-high", 65536), 65536);
  assert.notEqual(capMaxOutputTokens("gemini-3.7-flash-high", 65536), 8192);
});

test("3.7 Flash advertises thinking, tools and vision", () => {
  const spec = getModelSpec("gemini-3.7-flash");
  assert.equal(spec.supportsThinking, true);
  assert.equal(spec.supportsTools, true);
  assert.equal(spec.supportsVision, true);
});

test("Antigravity prices every tier id, not just the bare one", () => {
  // getPricingForModel is an exact-match lookup that never strips the tier
  // suffix, so a bare-id-only entry would bill each tier at $0.
  for (const base of GENERATIONS) {
    for (const tier of TIERS) {
      const rate = agPricing[`${base}${tier}`];
      assert.ok(rate, `${base}${tier} must have an Antigravity rate`);
      assert.equal(rate.input, 0.75);
      assert.equal(rate.output, 3.75);
      assert.equal(rate.cached, 0.075);
    }
  }
});

test("the direct Gemini provider prices 3.6/3.7 Flash at the same published rate", () => {
  for (const base of GENERATIONS) {
    assert.equal(geminiPricing[base].input, 0.75);
    assert.equal(geminiPricing[base].output, 3.75);
    assert.equal(geminiPricing[base].cached, 0.075);
  }
});

test("adding 3.6/3.7 did not disturb the neighbouring Flash generations", () => {
  assert.equal(getModelSpec("gemini-3-flash").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.5-flash").maxOutputTokens, 65536);
  assert.equal(getModelSpec("gemini-3.5-flash-low").maxOutputTokens, 65536);
  // 3.1 Pro keeps its own mandatory-thinking spec rather than prefix-matching Flash.
  assert.equal(getModelSpec("gemini-3.1-pro-high").mandatoryThinking, true);
});
