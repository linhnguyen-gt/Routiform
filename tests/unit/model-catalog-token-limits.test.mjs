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
const { REGISTRY } = await import("../../open-sse/config/registry-providers.ts");

// A provider whose registry entry carries defaults, so the fallback has something to find.
const PROVIDER = "cline";

test("the registry entry supplies the defaults", () => {
  const entry = REGISTRY[PROVIDER];
  assert.ok(entry?.defaultContextLength, "fixture provider must have a default context length");

  assert.deepEqual(resolveTokenLimits([PROVIDER]), {
    context_length: entry.defaultContextLength,
    ...(entry.defaultMaxOutputTokens ? { max_output_tokens: entry.defaultMaxOutputTokens } : {}),
  });
});

test("a model-level limit wins over the provider default", () => {
  const limits = resolveTokenLimits([PROVIDER], 123456, 7890);
  assert.equal(limits.context_length, 123456);
  assert.equal(limits.max_output_tokens, 7890);
});

test("each field falls back on its own", () => {
  const entry = REGISTRY[PROVIDER];
  const limits = resolveTokenLimits([PROVIDER], 123456);
  assert.equal(limits.context_length, 123456);
  assert.equal(limits.max_output_tokens, entry.defaultMaxOutputTokens);
});

test("the alias is tried before the canonical id", () => {
  assert.deepEqual(resolveTokenLimits(["definitely-not-a-provider", PROVIDER]), {
    context_length: REGISTRY[PROVIDER].defaultContextLength,
    ...(REGISTRY[PROVIDER].defaultMaxOutputTokens
      ? { max_output_tokens: REGISTRY[PROVIDER].defaultMaxOutputTokens }
      : {}),
  });
});

test("a provider with no registry entry yields no fields rather than zeros", () => {
  assert.deepEqual(resolveTokenLimits(["definitely-not-a-provider"]), {});
  assert.deepEqual(resolveTokenLimits([undefined]), {});
});

test("non-positive and non-numeric model values do not shadow the default", () => {
  const expected = REGISTRY[PROVIDER].defaultContextLength;
  assert.equal(resolveTokenLimits([PROVIDER], 0).context_length, expected);
  assert.equal(resolveTokenLimits([PROVIDER], -1).context_length, expected);
  assert.equal(resolveTokenLimits([PROVIDER], "262144").context_length, expected);
  assert.equal(resolveTokenLimits([PROVIDER], NaN).context_length, expected);
});

test("an empty key list opts out entirely, for entries that are not chat models", () => {
  assert.deepEqual(resolveTokenLimits([]), {});
  assert.deepEqual(resolveTokenLimits([], 4096), { context_length: 4096 });
});
