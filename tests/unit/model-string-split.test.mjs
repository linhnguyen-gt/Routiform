import test from "node:test";
import assert from "node:assert/strict";

import { splitModelString } from "../../src/shared/models/model-string.ts";
import { parseModel } from "../../open-sse/services/model.ts";
import {
  PROVIDER_MODELS,
  isValidModel,
  stripProviderPrefixFromModelId,
} from "../../open-sse/config/providerModels.ts";

// Cases where splitModelString must agree with parseModel's first-slash split.
// None of them carries a [1m] suffix — that divergence is pinned separately below.
const AGREEMENT_CASES = [
  {
    input: "nvidia/meta/llama-3.3-70b-instruct",
    expected: { providerRef: "nvidia", modelId: "meta/llama-3.3-70b-instruct" },
  },
  {
    input: "nvidia/nvidia/llama-3.3-70b-instruct",
    expected: { providerRef: "nvidia", modelId: "nvidia/llama-3.3-70b-instruct" },
  },
  {
    input: "kr/claude-sonnet-4.6",
    expected: { providerRef: "kr", modelId: "claude-sonnet-4.6" },
  },
  {
    input: "openrouter/openai/gpt-4o",
    expected: { providerRef: "openrouter", modelId: "openai/gpt-4o" },
  },
];

for (const { input, expected } of AGREEMENT_CASES) {
  test(`splitModelString splits "${input}" on the first slash`, () => {
    assert.deepStrictEqual(splitModelString(input), expected);
  });

  test(`splitModelString agrees with parseModel for "${input}"`, () => {
    const parsed = parseModel(input);
    assert.strictEqual(parsed.providerAlias, expected.providerRef);
    assert.strictEqual(parsed.model, expected.modelId);
  });
}

test("splitModelString returns null for a slash-less value (nested combo or model alias)", () => {
  assert.strictEqual(splitModelString("my-combo"), null);
  // parseModel treats the same input as a model alias, not a provider/model pair.
  assert.strictEqual(parseModel("my-combo").isAlias, true);
});

test("splitModelString returns null for empty provider ref, empty model id and empty input", () => {
  assert.strictEqual(splitModelString("/model"), null);
  assert.strictEqual(splitModelString("provider/"), null);
  assert.strictEqual(splitModelString(""), null);
  assert.strictEqual(splitModelString("   "), null);
});

test("splitModelString trims both halves, like parseModel", () => {
  assert.deepStrictEqual(splitModelString("  cx / gpt-5.4  "), {
    providerRef: "cx",
    modelId: "gpt-5.4",
  });
  const parsed = parseModel("  cx / gpt-5.4  ");
  assert.strictEqual(parsed.providerAlias, "cx");
  assert.strictEqual(parsed.model, "gpt-5.4");
});

// Documented divergence: parseModel strips the [1m] extended-context suffix
// BEFORE splitting; splitModelString retains it so the returned modelId still
// equals the stored combo entry. Recorded, not hidden.
test("splitModelString retains a [1m] suffix that parseModel strips", () => {
  assert.deepStrictEqual(splitModelString("kr/claude-sonnet-4.6[1m]"), {
    providerRef: "kr",
    modelId: "claude-sonnet-4.6[1m]",
  });

  const parsed = parseModel("kr/claude-sonnet-4.6[1m]");
  assert.strictEqual(parsed.providerAlias, "kr");
  assert.strictEqual(parsed.model, "claude-sonnet-4.6");
  assert.strictEqual(parsed.extendedContext, true);
});

test("every NVIDIA catalog id round-trips through splitModelString into isValidModel", () => {
  const models = PROVIDER_MODELS["nvidia"] ?? [];
  assert.ok(models.length > 0, "NVIDIA catalog must not be empty");

  for (const model of models) {
    const split = splitModelString(`nvidia/${model.id}`);
    assert.ok(split, `nvidia/${model.id} must split`);
    assert.strictEqual(split.providerRef, "nvidia");
    assert.strictEqual(split.modelId, model.id);
    assert.strictEqual(
      isValidModel("nvidia", split.modelId),
      true,
      `isValidModel("nvidia", "${split.modelId}") must be true`
    );
  }
});

// Known over-strip, documented rather than hardened: the only consumer that
// trusts the stripped value blindly (open-sse/executors/opencode.ts:14) does
// not serve NVIDIA, and hardening would change behavior for every provider.
test("stripProviderPrefixFromModelId over-strips a self-prefixed NVIDIA id, but isValidModel still accepts it", () => {
  assert.strictEqual(
    stripProviderPrefixFromModelId("nvidia", "nvidia/llama-3.3-70b-instruct"),
    "llama-3.3-70b-instruct"
  );
  assert.strictEqual(isValidModel("nvidia", "nvidia/llama-3.3-70b-instruct"), true);
});
