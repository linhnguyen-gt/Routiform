/**
 * Characterisation test for the ModelSelectModal model derivation.
 *
 * `referenceDerive` below is a verbatim copy of the `groupedModels` memo body as it
 * stood in src/shared/components/ModelSelectModal.tsx:376-569 BEFORE the extraction,
 * together with the helpers it used (`PROVIDER_ORDER`, `OPENROUTER_FALLBACK_MODELS`,
 * `dedupeModelsById`). It is the frozen reference: every fixture asserts that
 * `deriveAvailableModels` produces exactly what the old inline code produced.
 *
 * Fixtures 9-11 pin the quirks a "cleanup" would be most tempted to remove — the
 * legacy-alias branches, the double `.replace()`, and the falsy-id push. If any of
 * those expectations has to change, the extraction changed behaviour and has failed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveAvailableModels,
  flattenAvailableModels,
} from "../../src/shared/models/available-models.ts";
import { splitModelString } from "../../src/shared/models/model-string.ts";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "../../src/shared/constants/models.ts";
import {
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
  OAUTH_PROVIDERS,
  resolveProviderId,
} from "../../src/shared/constants/providers.ts";

// ──────────────── Frozen reference implementation (pre-extraction) ────────────────

const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

const OPENROUTER_FALLBACK_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
];

function dedupeModelsById(models) {
  const seen = new Set();
  const out = [];
  for (const m of models) {
    const id = m?.id != null ? String(m.id) : "";
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(m);
  }
  return out;
}

function referenceDerive({
  connections,
  liveModelsByProvider,
  customModels,
  providerNodes,
  modelAliases,
  openrouterCatalog,
}) {
  const allProviders = { ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...APIKEY_PROVIDERS };
  const groups = {};

  const activeConnectionIds = connections.map((p) => p.provider);
  const providerIdsToShow = new Set([...activeConnectionIds]);

  const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
    const indexA = PROVIDER_ORDER.indexOf(a);
    const indexB = PROVIDER_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  sortedProviderIds.forEach((rawProviderId) => {
    const providerId = resolveProviderId(rawProviderId) || rawProviderId;
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
    const isCustomProvider =
      isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
    const liveProviderModels =
      liveModelsByProvider[rawProviderId] || liveModelsByProvider[providerId] || [];
    const providerCustomModels = customModels[providerId] || customModels[rawProviderId] || [];

    if (providerInfo.passthroughModels) {
      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${alias}/${m.id}`,
      }));
      const syncedEntries = providerCustomModels.map((cm) => ({
        id: cm.id,
        name: cm.name || cm.id,
        value: `${alias}/${cm.id}`,
        isCustom: true,
      }));
      const legacyAliasEntries =
        syncedEntries.length === 0
          ? Object.entries(modelAliases)
              .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
              .map(([aliasName, fullModel]) => ({
                id: fullModel.replace(`${alias}/`, ""),
                name: aliasName,
                value: fullModel,
              }))
          : [];

      const allModels = dedupeModelsById([...liveEntries, ...syncedEntries, ...legacyAliasEntries]);

      if (allModels.length > 0) {
        const matchedNode = providerNodes.find((node) => node.id === providerId);
        const displayName = matchedNode?.name || providerInfo.name;
        groups[providerId] = {
          name: displayName,
          alias: alias,
          color: providerInfo.color,
          models: allModels,
        };
      }
    } else if (isCustomProvider) {
      const matchedNode = providerNodes.find((node) => node.id === providerId);
      const displayName = matchedNode?.name || providerInfo.name;
      const nodePrefix = matchedNode?.prefix || providerId;

      const syncedEntries = providerCustomModels.map((cm) => ({
        id: cm.id,
        name: cm.name || cm.id,
        value: `${nodePrefix}/${cm.id}`,
        isCustom: true,
      }));
      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${nodePrefix}/${m.id}`,
      }));
      const legacyAliasEntries =
        syncedEntries.length === 0
          ? Object.entries(modelAliases)
              .filter(
                ([, fullModel]) =>
                  fullModel.startsWith(`${nodePrefix}/`) || fullModel.startsWith(`${providerId}/`)
              )
              .map(([aliasName, fullModel]) => {
                const modelId = fullModel
                  .replace(`${nodePrefix}/`, "")
                  .replace(`${providerId}/`, "");
                return { id: modelId, name: aliasName, value: `${nodePrefix}/${modelId}` };
              })
          : [];

      const allModels = dedupeModelsById([...liveEntries, ...syncedEntries, ...legacyAliasEntries]);

      if (allModels.length > 0) {
        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: allModels,
          isCustom: true,
          hasModels: true,
        };
      }
    } else {
      const systemModels = getModelsByProviderId(providerId);

      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${alias}/${m.id}`,
      }));
      const systemEntries = systemModels.map((m) => ({
        id: m.id,
        name: m.name,
        value: `${alias}/${m.id}`,
      }));
      const customEntries = providerCustomModels
        .filter((cm) => !systemModels.some((sm) => sm.id === cm.id))
        .map((cm) => ({
          id: cm.id,
          name: cm.name || cm.id,
          value: `${alias}/${cm.id}`,
          isCustom: true,
        }));

      let catalogEntries = [];
      if (providerId === "openrouter") {
        const already = new Set([
          ...systemEntries.map((m) => String(m.id)),
          ...customEntries.map((c) => String(c.id)),
        ]);
        const source =
          openrouterCatalog.length > 0 ? openrouterCatalog : OPENROUTER_FALLBACK_MODELS;
        catalogEntries = source
          .filter((m) => m?.id && !already.has(String(m.id)))
          .map((m) => ({ id: m.id, name: m.name || m.id, value: `${alias}/${m.id}` }));
      }

      const allModels =
        liveEntries.length > 0
          ? dedupeModelsById([...liveEntries, ...customEntries])
          : dedupeModelsById([...systemEntries, ...customEntries, ...catalogEntries]);

      if (allModels.length > 0) {
        groups[providerId] = {
          name: providerInfo.name,
          alias: alias,
          color: providerInfo.color,
          models: allModels,
        };
      }
    }
  });

  return groups;
}

/**
 * The extraction returns an ordered array instead of a Record (the Record's insertion
 * order already WAS the sort order) and stamps providerId/prefix onto each model. This
 * adapter applies exactly those two documented transformations to the reference output,
 * so any other difference fails the comparison.
 */
function adaptReference(groupsRecord) {
  return Object.entries(groupsRecord).map(([providerId, group]) => ({
    providerId,
    ...group,
    models: group.models.map((m) => ({ ...m, providerId, prefix: group.alias })),
  }));
}

function makeInput(overrides = {}) {
  return {
    connections: [],
    liveModelsByProvider: {},
    customModels: {},
    providerNodes: [],
    modelAliases: {},
    openrouterCatalog: [],
    ...overrides,
  };
}

// ──────────────── Fixtures ────────────────

const OPENAI_MODEL_COUNT = getModelsByProviderId("openai").length;

const FIXTURES = [
  {
    name: "1. no connections yields no groups",
    input: makeInput(),
  },
  {
    name: "2. one static-registry provider",
    input: makeInput({ connections: [{ id: "c1", provider: "openai" }] }),
  },
  {
    name: "3. one passthrough provider",
    input: makeInput({
      connections: [{ id: "c1", provider: "aimlapi" }],
      customModels: { aimlapi: [{ id: "some/model", name: "Some Model" }] },
    }),
  },
  {
    name: "4. OpenAI-compatible provider with a node prefix",
    input: makeInput({
      connections: [{ id: "c1", provider: "openai-compatible-abc" }],
      providerNodes: [{ id: "openai-compatible-abc", name: "My Node", prefix: "mynode" }],
      customModels: { "openai-compatible-abc": [{ id: "gpt-4o", name: "GPT-4o" }] },
    }),
  },
  {
    name: "5. OpenRouter with a live catalog",
    input: makeInput({
      connections: [{ id: "c1", provider: "openrouter" }],
      openrouterCatalog: [
        { id: "x-ai/grok-4", name: "Grok 4" },
        { id: "openai/gpt-4o", name: "GPT-4o" },
      ],
    }),
  },
  {
    name: "6. OpenRouter without a catalog falls back to the static list",
    input: makeInput({ connections: [{ id: "c1", provider: "openrouter" }] }),
  },
  {
    name: "7. live models OVERRIDE the static catalog, never merge",
    input: makeInput({
      connections: [{ id: "c1", provider: "openai" }],
      liveModelsByProvider: { openai: [{ id: "live-only-model", name: "Live Only" }] },
    }),
  },
  {
    name: "8. alias key differs from the provider id (kr -> kiro)",
    input: makeInput({
      connections: [{ id: "c1", provider: "kr" }],
      liveModelsByProvider: { kr: [{ id: "claude-sonnet-4.6", name: "Sonnet" }] },
    }),
  },
  {
    name: "9. passthrough legacy-alias branch (no synced models)",
    input: makeInput({
      connections: [{ id: "c1", provider: "aimlapi" }],
      modelAliases: { "my-alias": "aiml/vendor/some-model", other: "openai/gpt-4o" },
    }),
  },
  {
    name: "10. compatible legacy-alias branch exercises the double .replace()",
    input: makeInput({
      connections: [{ id: "c1", provider: "openai-compatible-1" }],
      providerNodes: [{ id: "openai-compatible-1", name: "OC", prefix: "oc" }],
      modelAliases: { legacy: "oc/openai-compatible-1/gpt-4o" },
    }),
  },
  {
    name: "11. a falsy model id survives dedupe and is pushed anyway",
    input: makeInput({
      connections: [{ id: "c1", provider: "aimlapi" }],
      customModels: {
        aimlapi: [
          { id: null, name: "Broken" },
          { id: "", name: "Also Broken" },
          { id: "good", name: "Good" },
        ],
      },
    }),
  },
];

for (const fixture of FIXTURES) {
  test(`derivation matches the pre-extraction reference — ${fixture.name}`, () => {
    assert.deepStrictEqual(
      deriveAvailableModels(fixture.input),
      adaptReference(referenceDerive(fixture.input))
    );
  });
}

// ──────────────── Literal expectations for the load-bearing quirks ────────────────

test("fixture 1: no connections yields an empty array", () => {
  assert.deepStrictEqual(deriveAvailableModels(makeInput()), []);
});

test("fixture 2: a static-registry provider emits the whole catalog under its alias", () => {
  const groups = deriveAvailableModels(
    makeInput({ connections: [{ id: "c1", provider: "openai" }] })
  );
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].providerId, "openai");
  assert.strictEqual(groups[0].alias, "openai");
  assert.strictEqual(groups[0].models.length, OPENAI_MODEL_COUNT);
  assert.ok(groups[0].models.every((m) => m.value === `openai/${m.id}`));
});

test("fixture 6: OpenRouter with no catalog falls back to the six static models", () => {
  const groups = deriveAvailableModels(
    makeInput({ connections: [{ id: "c1", provider: "openrouter" }] })
  );
  assert.deepStrictEqual(
    groups[0].models.map((m) => m.value),
    [
      "openrouter/openai/gpt-4o-mini",
      "openrouter/openai/gpt-4o",
      "openrouter/anthropic/claude-3.5-sonnet",
      "openrouter/google/gemini-2.0-flash-001",
      "openrouter/deepseek/deepseek-chat",
      "openrouter/meta-llama/llama-3.3-70b-instruct",
    ]
  );
});

test("fixture 7: live entries replace the static catalog outright", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [{ id: "c1", provider: "openai" }],
      liveModelsByProvider: { openai: [{ id: "live-only-model", name: "Live Only" }] },
    })
  );
  assert.deepStrictEqual(
    groups[0].models.map((m) => m.value),
    ["openai/live-only-model"]
  );
});

test("fixture 8: a connection stored under the alias resolves to the provider id", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [{ id: "c1", provider: "kr" }],
      liveModelsByProvider: { kr: [{ id: "claude-sonnet-4.6", name: "Sonnet" }] },
    })
  );
  assert.strictEqual(groups[0].providerId, "kiro");
  assert.strictEqual(groups[0].alias, "kr");
  assert.deepStrictEqual(
    groups[0].models.map((m) => m.value),
    ["kr/claude-sonnet-4.6"]
  );
});

test("fixture 9: the passthrough legacy-alias branch strips only the alias prefix", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [{ id: "c1", provider: "aimlapi" }],
      modelAliases: { "my-alias": "aiml/vendor/some-model", other: "openai/gpt-4o" },
    })
  );
  assert.deepStrictEqual(groups[0].models, [
    {
      id: "vendor/some-model",
      name: "my-alias",
      value: "aiml/vendor/some-model",
      providerId: "aimlapi",
      prefix: "aiml",
    },
  ]);
});

test("fixture 10: the compatible legacy-alias branch applies BOTH replacements", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [{ id: "c1", provider: "openai-compatible-1" }],
      providerNodes: [{ id: "openai-compatible-1", name: "OC", prefix: "oc" }],
      modelAliases: { legacy: "oc/openai-compatible-1/gpt-4o" },
    })
  );
  // "oc/" is stripped first, then "openai-compatible-1/" from the remainder.
  assert.deepStrictEqual(groups[0].models, [
    {
      id: "gpt-4o",
      name: "legacy",
      value: "oc/gpt-4o",
      providerId: "openai-compatible-1",
      prefix: "oc",
    },
  ]);
});

// [UNVERIFIED REACHABILITY] No upstream source was traced that emits a model with a
// falsy id — this pins the behaviour defensively rather than reproducing an observed
// bug. dedupeModelsById skips only the `seen` bookkeeping for a falsy id; the item is
// pushed regardless, and the ORIGINAL `m.id` (not the normalized local) reaches the
// template literal, so `null` interpolates to the string "null".
test("fixture 11: falsy-id models are kept, and interpolate their raw value", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [{ id: "c1", provider: "aimlapi" }],
      customModels: {
        aimlapi: [
          { id: null, name: "Broken" },
          { id: "", name: "Also Broken" },
          { id: "good", name: "Good" },
        ],
      },
    })
  );
  assert.deepStrictEqual(
    groups[0].models.map((m) => m.value),
    ["aiml/null", "aiml/", "aiml/good"]
  );
});

// ──────────────── Cross-cutting invariants ────────────────

test("flattenAvailableModels returns every model across every group, in order", () => {
  const input = makeInput({
    connections: [
      { id: "c1", provider: "openai" },
      { id: "c2", provider: "openrouter" },
    ],
  });
  const groups = deriveAvailableModels(input);
  assert.strictEqual(
    flattenAvailableModels(groups).length,
    groups.reduce((sum, g) => sum + g.models.length, 0)
  );
});

test("every emitted value splits back into a provider ref and a model id", () => {
  const input = makeInput({
    connections: [
      { id: "c1", provider: "openai" },
      { id: "c2", provider: "openrouter" },
      { id: "c3", provider: "kr" },
    ],
  });
  for (const model of flattenAvailableModels(deriveAvailableModels(input))) {
    assert.notStrictEqual(
      splitModelString(model.value),
      null,
      `${model.value} must split into provider/model`
    );
  }
});

test("groups follow PROVIDER_ORDER: OAuth before Free before API key", () => {
  const groups = deriveAvailableModels(
    makeInput({
      connections: [
        { id: "c1", provider: "openai" },
        { id: "c2", provider: "kiro" },
      ],
    })
  );
  const order = groups.map((g) => g.providerId);
  assert.ok(
    order.indexOf("kiro") < order.indexOf("openai"),
    `expected kiro (OAuth) before openai (API key), got ${order.join(", ")}`
  );
});
