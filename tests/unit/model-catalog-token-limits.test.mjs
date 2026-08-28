/**
 * `context_length` / `max_output_tokens` on /v1/models entries.
 *
 * The catalog emits chat models from five different branches, and only the built-in
 * PROVIDER_MODELS one consulted the provider registry. A model that arrived as a custom
 * import or a managed fallback was therefore published with no limits at all — over half
 * the catalog — which every CLI tool then read back as "this model has no context window".
 * The registry default is the same number whichever branch produced the entry.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { resolveTokenLimits } = await import("../../src/app/api/v1/models/catalog.ts");
const { getModelSpec } = await import("../../src/shared/constants/modelSpecs.ts");
const { REGISTRY } = await import("../../open-sse/config/registry-providers.ts");

const PROVIDER = "cline";
const MODEL_ID = "gemini-3.7-flash";
const SPEC = getModelSpec(MODEL_ID);

test("explicit context/output win over spec", () => {
  const limits = resolveTokenLimits({
    registryKeys: [PROVIDER],
    modelId: MODEL_ID,
    context: 123456,
    output: 7890,
  });
  assert.equal(limits.context_length, 123456);
  assert.equal(limits.max_output_tokens, 7890);
});

test("modelId in MODEL_SPECS fills both fields when explicit absent", () => {
  const limits = resolveTokenLimits({
    registryKeys: [PROVIDER],
    modelId: MODEL_ID,
  });
  assert.equal(limits.context_length, SPEC.contextWindow);
  assert.equal(limits.max_output_tokens, SPEC.maxOutputTokens);
});

test("unknown modelId + sentinel provider cline -> {}", () => {
  const limits = resolveTokenLimits({
    registryKeys: [PROVIDER],
    modelId: "definitely-not-a-model-id",
  });
  assert.deepEqual(limits, {});
});

test("unknown modelId + Codex registry keys -> { context_length: 400000, max_output_tokens: 128000 }", () => {
  const limits = resolveTokenLimits({
    registryKeys: ["codex"],
    modelId: "definitely-not-a-model-id",
  });

  // Verify what we expect against the actual REGISTRY defaults
  assert.equal(REGISTRY["codex"].defaultContextLength, 400000);
  assert.equal(REGISTRY["codex"].defaultMaxOutputTokens, 128000);

  assert.deepEqual(limits, {
    context_length: 400000,
    max_output_tokens: 128000,
  });
});

test("non-positive explicit does not count as a row value", () => {
  // For sentinel cline + no/unknown modelId, result is {}
  assert.deepEqual(resolveTokenLimits({ registryKeys: [PROVIDER], context: 0 }), {});
  assert.deepEqual(resolveTokenLimits({ registryKeys: [PROVIDER], context: -1 }), {});
  assert.deepEqual(resolveTokenLimits({ registryKeys: [PROVIDER], context: NaN }), {});
  assert.deepEqual(resolveTokenLimits({ registryKeys: [PROVIDER], context: "262144" }), {});

  // For a MODEL_SPECS id, result is the spec
  const limits = resolveTokenLimits({
    registryKeys: [PROVIDER],
    modelId: MODEL_ID,
    context: 0,
    output: -1,
  });
  assert.equal(limits.context_length, SPEC.contextWindow);
  assert.equal(limits.max_output_tokens, SPEC.maxOutputTokens);
});

test("empty registryKeys + explicit context still publishes context only", () => {
  assert.deepEqual(resolveTokenLimits({ registryKeys: [], context: 4096 }), {
    context_length: 4096,
  });
  assert.deepEqual(resolveTokenLimits({ registryKeys: [] }), {});
});

test("output-only explicit does not invent context", () => {
  assert.deepEqual(resolveTokenLimits({ registryKeys: [], output: 1024 }), {
    max_output_tokens: 1024,
  });
});

test("unknown provider keys still yield {} (no zeros)", () => {
  assert.deepEqual(resolveTokenLimits({ registryKeys: ["definitely-not-a-provider"] }), {});
  assert.deepEqual(resolveTokenLimits({ registryKeys: [undefined] }), {});
});
