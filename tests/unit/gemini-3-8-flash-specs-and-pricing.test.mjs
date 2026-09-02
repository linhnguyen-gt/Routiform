import test from "node:test";
import assert from "node:assert/strict";

/**
 * Gemini 3.8 Flash reaches Routiform through Antigravity's live
 * `fetchAvailableModels` passthrough. Everything keyed off the model id must be registered:
 *
 *   - MODEL_SPECS: 1M context / 64K output, thinking + tools + vision.
 *   - agPricing: prices every Antigravity tier id ("-extra-low", "-low", "-medium", "-high", "-tiered").
 *   - geminiPricing: direct Gemini provider pricing parity.
 *   - cliTools: Antigravity tool defaults and aliases include gemini-3.8-flash.
 *   - taskFitnessTable: autoCombo includes gemini-3.8-flash.
 */

const { getModelSpec, capMaxOutputTokens } =
  await import("../../src/shared/constants/modelSpecs.ts");
const { agPricing } = await import("../../src/shared/constants/pricing/ag-pricing.ts");
const { geminiPricing } = await import("../../src/shared/constants/pricing/gemini-pricing.ts");
const { CLI_TOOLS } = await import("../../src/shared/constants/cliTools.ts");
const { FITNESS_TABLE } = await import("../../open-sse/services/autoCombo/taskFitnessTable.ts");
const { DEFAULT_ANTIGRAVITY_MODELS } =
  await import("../../src/lib/providers/antigravityLiveModels.ts");
const { handleAntigravityModels } =
  await import("../../src/app/api/providers/[id]/models/handle-antigravity-models.ts");
const { cleanModelName } =
  await import("../../open-sse/executors/antigravity/request-transform.ts");

const TIERS = ["", "-extra-low", "-low", "-medium", "-high", "-tiered"];
const GENERATION = "gemini-3.8-flash";

test("every 3.8 Flash tier resolves to the published 64K output ceiling and 1M context", () => {
  for (const tier of TIERS) {
    const id = `${GENERATION}${tier}`;
    const spec = getModelSpec(id);
    assert.ok(spec, `${id} must resolve to a spec, not fall through to __default__`);
    assert.equal(spec.maxOutputTokens, 65536, `${id} output ceiling`);
    assert.equal(spec.contextWindow, 1048576, `${id} context window`);
  }
});

test("client explicitly asking for up to 65536 tokens gets it (not capped at 8192)", () => {
  assert.equal(capMaxOutputTokens("gemini-3.8-flash-high", 65536), 65536);
  assert.notEqual(capMaxOutputTokens("gemini-3.8-flash-high", 65536), 8192);
});

test("3.8 Flash advertises thinking, tools and vision", () => {
  const spec = getModelSpec("gemini-3.8-flash");
  assert.equal(spec.supportsThinking, true);
  assert.equal(spec.supportsTools, true);
  assert.equal(spec.supportsVision, true);
});

test("Antigravity prices every 3.8 Flash tier id", () => {
  for (const tier of TIERS) {
    const rate = agPricing[`${GENERATION}${tier}`];
    assert.ok(rate, `${GENERATION}${tier} must have an Antigravity rate`);
    assert.equal(rate.input, 0.75);
    assert.equal(rate.output, 3.75);
    assert.equal(rate.cached, 0.075);
  }
});

test("direct Gemini provider prices 3.8 Flash at published rate", () => {
  const rate = geminiPricing[GENERATION];
  assert.ok(rate, `${GENERATION} must have a Gemini rate`);
  assert.equal(rate.input, 0.75);
  assert.equal(rate.output, 3.75);
  assert.equal(rate.cached, 0.075);
});

test("Antigravity CLI tool configuration includes gemini-3.8-flash", () => {
  const agTool = CLI_TOOLS.antigravity;
  assert.ok(agTool.modelAliases.includes("gemini-3.8-flash"));
  assert.ok(agTool.defaultModels.some((m) => m.id === "gemini-3.8-flash"));
});

test("task fitness table includes gemini-3.8-flash", () => {
  for (const [taskType, scores] of Object.entries(FITNESS_TABLE)) {
    if (scores["gemini-3.6-flash"]) {
      assert.ok(
        scores["gemini-3.8-flash"],
        `task ${taskType} should include score for gemini-3.8-flash`
      );
    }
  }
});

test("DEFAULT_ANTIGRAVITY_MODELS includes gemini-3.8-flash", () => {
  assert.ok(DEFAULT_ANTIGRAVITY_MODELS.some((m) => m.id === "gemini-3.8-flash"));
});

test("handleAntigravityModels provides default models including gemini-3.8-flash when fetch fails", async () => {
  const mockCtx = {
    provider: "antigravity",
    connectionId: "conn_test",
    connection: { id: "conn_test", accessToken: "invalid", projectId: "test_proj" },
    proxy: null,
    buildResponse: (payload) => payload,
  };
  const res = await handleAntigravityModels(mockCtx);
  assert.ok(res.models.some((m) => m.id === "gemini-3.8-flash"));
  assert.equal(res.source, "local_catalog");
});

test("cleanModelName maps bare gemini-3.8-flash to high tier to prevent upstream 404", () => {
  assert.equal(cleanModelName("antigravity/gemini-3.8-flash"), "gemini-3.8-flash-high");
  assert.equal(cleanModelName("gemini-3.8-flash"), "gemini-3.8-flash-high");
  assert.equal(cleanModelName("antigravity/gemini-3.8-flash-high"), "gemini-3.8-flash-high");
  assert.equal(cleanModelName("antigravity/gemini-3.8-flash-medium"), "gemini-3.8-flash-medium");
  assert.equal(cleanModelName("antigravity/gemini-3.8-flash-low"), "gemini-3.8-flash-low");
});

test("DEFAULT_ANTIGRAVITY_MODELS includes 3.8 flash tier models", () => {
  assert.ok(DEFAULT_ANTIGRAVITY_MODELS.some((m) => m.id === "gemini-3.8-flash-high"));
  assert.ok(DEFAULT_ANTIGRAVITY_MODELS.some((m) => m.id === "gemini-3.8-flash-medium"));
  assert.ok(DEFAULT_ANTIGRAVITY_MODELS.some((m) => m.id === "gemini-3.8-flash-low"));
});
