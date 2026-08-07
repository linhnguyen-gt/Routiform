import test from "node:test";
import assert from "node:assert/strict";

import { COMBO_TEMPLATES } from "../../src/app/(dashboard)/dashboard/combos/components/combo-constants.ts";
import { resolveTemplate } from "../../src/app/(dashboard)/dashboard/combos/components/combo-template-resolver.ts";
import { flattenAvailableModels } from "../../src/shared/models/available-models.ts";
import { splitModelString } from "../../src/shared/models/model-string.ts";

const templateById = (id) => {
  const found = COMBO_TEMPLATES.find((t) => t.id === id);
  assert.ok(found, `template ${id} must exist`);
  return found;
};

/** Build an AvailableModelGroup the way deriveAvailableModels would. */
function group(providerId, alias, modelIds, extra = {}) {
  return {
    providerId,
    name: providerId,
    alias,
    color: "#000",
    models: modelIds.map((id) => ({
      value: `${alias}/${id}`,
      id,
      name: id,
      providerId,
      prefix: alias,
    })),
    ...extra,
  };
}

function connection(provider, overrides = {}) {
  return {
    id: `conn-${provider}`,
    provider,
    credentialsConfigured: true,
    testStatus: "unknown",
    isActive: 1,
    ...overrides,
  };
}

function resolve(templateId, { groups = [], connections = [], pricing = {}, nodes = [] } = {}) {
  return resolveTemplate({
    template: templateById(templateId),
    groups,
    connections,
    pricingByProvider: pricing,
    providerNodes: nodes,
  });
}

const KIRO = group("kiro", "kr", ["claude-sonnet-4.6", "claude-opus-4.8"]);
const QODER = group("qoder", "qd", ["qoder-a", "qoder-b"]);
const GROQ = group("groq", "groq", ["llama-3.3-70b-versatile", "qwen/qwen3-32b"]);
const OPENAI = group("openai", "openai", ["gpt-4o", "gpt-4o-mini"]);
const CURSOR = group("cursor", "cu", ["claude-4.6-opus-high", "claude-4.6-sonnet-high"]);
const ANTIGRAVITY = group("antigravity", "antigravity", ["gemini-3-pro-high", "claude-sonnet-4-6"]);

// ──────────────── No connections ────────────────

for (const template of COMBO_TEMPLATES) {
  test(`${template.id}: zero connections is unsatisfiable with templateNeedsAnyProvider`, () => {
    const result = resolve(template.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonKey, "templateNeedsAnyProvider");
  });
}

// ──────────────── Connection eligibility ────────────────

const INELIGIBLE = [
  ["testStatus error", { testStatus: "error" }],
  ["missing credentials", { credentialsConfigured: false }],
  ["isActive 0", { isActive: 0 }],
  ["isActive false", { isActive: false }],
];

for (const [label, overrides] of INELIGIBLE) {
  test(`a connection with ${label} contributes no models`, () => {
    const result = resolve("high-availability", {
      groups: [OPENAI],
      connections: [connection("openai", overrides)],
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reasonKey, "templateNeedsAnyProvider");
  });
}

test("a connection with testStatus 'unknown' does contribute models", () => {
  const result = resolve("high-availability", {
    groups: [OPENAI],
    connections: [connection("openai", { testStatus: "unknown" })],
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.models.length, 1, "maxPerProvider is 1 for high-availability");
});

// ──────────────── M8: connected but the catalog returned nothing ────────────────

test("a connected provider with no group reports templateProviderNoModels, not 'connect X'", () => {
  const result = resolve("high-availability", {
    groups: [],
    connections: [connection("openai")],
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonKey, "templateProviderNoModels");
  assert.match(result.reasonParams.providers, /OpenAI/i);
});

test("free-stack names the connected free provider whose catalog is empty", () => {
  const result = resolve("free-stack", { groups: [], connections: [connection("kiro")] });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonKey, "templateProviderNoModels");
});

test("free-stack tells a non-free-provider user which providers to connect", () => {
  const result = resolve("free-stack", { groups: [OPENAI], connections: [connection("openai")] });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonKey, "templateNeedsProviders");
  assert.ok(result.reasonParams.providers.length > 0);
});

// ──────────────── Deprecated providers ────────────────

test("a deprecated provider never reaches any template's output", () => {
  const geminiCli = group("gemini-cli", "gemini-cli", ["gemini-3-flash-preview"]);
  for (const template of COMBO_TEMPLATES) {
    const result = resolve(template.id, {
      groups: [geminiCli],
      connections: [connection("gemini-cli")],
    });
    assert.strictEqual(
      result.ok,
      false,
      `${template.id} must not resolve from a deprecated provider`
    );
  }
});

// ──────────────── free-stack tiering ────────────────

test("free-stack ranks tier A above tier C", () => {
  const result = resolve("free-stack", {
    groups: [GROQ, KIRO],
    connections: [connection("groq"), connection("kiro")],
  });
  assert.strictEqual(result.ok, true);
  const firstKiro = result.models.findIndex((m) => m.model.startsWith("kr/"));
  const firstGroq = result.models.findIndex((m) => m.model.startsWith("groq/"));
  assert.ok(
    firstKiro < firstGroq,
    `expected kiro before groq, got ${JSON.stringify(result.models)}`
  );
});

test("free-stack orders strictly A then B then C", () => {
  // openai has no free signal, so its only route into free-stack is a zero price (tier B).
  const result = resolve("free-stack", {
    groups: [GROQ, OPENAI, KIRO],
    connections: [connection("groq"), connection("openai"), connection("kiro")],
    pricing: { openai: { "gpt-4o": { input: 0 }, "gpt-4o-mini": { input: 0 } } },
  });
  assert.strictEqual(result.ok, true);
  const tierOf = (value) => (value.startsWith("kr/") ? 0 : value.startsWith("openai/") ? 1 : 2);
  const tiers = result.models.map((m) => tierOf(m.model));
  assert.deepStrictEqual(
    tiers,
    [...tiers].sort((a, b) => a - b),
    `got ${tiers.join(",")}`
  );
});

test("tier C models are badged limitedFreeTier; tiers A and B are not", () => {
  const result = resolve("free-stack", {
    groups: [GROQ, OPENAI, KIRO],
    connections: [connection("groq"), connection("openai"), connection("kiro")],
    pricing: { openai: { "gpt-4o": { input: 0 }, "gpt-4o-mini": { input: 0 } } },
  });
  assert.strictEqual(result.ok, true);
  for (const entry of result.models) {
    if (entry.model.startsWith("groq/")) {
      assert.strictEqual(entry.limitedFreeTier, true);
    } else {
      assert.ok(
        !("limitedFreeTier" in entry),
        `${entry.model} must not carry the marker at all, not even as false`
      );
    }
  }
});

test("empty pricing never drops a tier A or tier C provider", () => {
  const withPricing = resolve("free-stack", {
    groups: [GROQ, KIRO],
    connections: [connection("groq"), connection("kiro")],
    pricing: { groq: { "llama-3.3-70b-versatile": { input: 0 } } },
  });
  const withoutPricing = resolve("free-stack", {
    groups: [GROQ, KIRO],
    connections: [connection("groq"), connection("kiro")],
  });
  assert.strictEqual(withPricing.ok, true);
  assert.strictEqual(withoutPricing.ok, true);
  assert.deepStrictEqual(
    withoutPricing.models.map((m) => m.model).sort(),
    withPricing.models.map((m) => m.model).sort()
  );
});

test("overwriting a zero price demotes tier B but keeps tier C providers", () => {
  const result = resolve("free-stack", {
    groups: [GROQ, KIRO],
    connections: [connection("groq"), connection("kiro")],
    pricing: { groq: { "llama-3.3-70b-versatile": { input: 9.99 } } },
  });
  assert.strictEqual(result.ok, true);
  const groqEntry = result.models.find((m) => m.model === "groq/llama-3.3-70b-versatile");
  assert.ok(groqEntry, "groq stays qualified via tier C even when its price is non-zero");
  assert.strictEqual(groqEntry.limitedFreeTier, true);
});

test("free-stack with a single free model is unsatisfiable (minModels 2 for round-robin)", () => {
  const result = resolve("free-stack", {
    groups: [group("kiro", "kr", ["claude-sonnet-4.6"])],
    connections: [connection("kiro")],
  });
  assert.strictEqual(result.ok, false);
});

// ──────────────── cost-saver ────────────────

test("cost-saver with no pricing anywhere reports templateNeedsPricing", () => {
  const result = resolve("cost-saver", { groups: [OPENAI], connections: [connection("openai")] });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonKey, "templateNeedsPricing");
});

test("cost-saver emits only priced models, ascending", () => {
  const result = resolve("cost-saver", {
    groups: [OPENAI, GROQ],
    connections: [connection("openai"), connection("groq")],
    pricing: {
      openai: { "gpt-4o": { input: 5 }, "gpt-4o-mini": { input: 0.6 } },
      groq: { "llama-3.3-70b-versatile": { input: 0 } },
      // qwen/qwen3-32b deliberately unpriced
    },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(
    result.models.map((m) => m.model),
    ["groq/llama-3.3-70b-versatile", "openai/gpt-4o-mini", "openai/gpt-4o"]
  );
});

// ──────────────── paid-premium ────────────────

test("paid-premium resolves from OAuth subscriptions only", () => {
  const result = resolve("paid-premium", {
    groups: [OPENAI, CURSOR, ANTIGRAVITY, KIRO],
    connections: [
      connection("openai"),
      connection("cursor"),
      connection("antigravity"),
      connection("kiro"),
    ],
  });
  assert.strictEqual(result.ok, true);
  for (const entry of result.models) {
    assert.ok(
      entry.model.startsWith("cu/") || entry.model.startsWith("antigravity/"),
      `${entry.model} is not a paid OAuth subscription model`
    );
  }
});

// ──────────────── Caps and diversity ────────────────

test("no provider exceeds maxPerProvider and nothing exceeds maxModels", () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    group(
      `p${i}`,
      `p${i}`,
      Array.from({ length: 10 }, (_, j) => `m${j}`)
    )
  );
  const conns = many.map((g) => connection(g.providerId));
  for (const template of COMBO_TEMPLATES) {
    const result = resolve(template.id, {
      groups: many,
      connections: conns,
      pricing: Object.fromEntries(
        many.map((g) => [g.alias, Object.fromEntries(g.models.map((m) => [m.id, { input: 1 }]))])
      ),
    });
    if (!result.ok) continue;
    assert.ok(
      result.models.length <= template.selector.maxModels,
      `${template.id} exceeded maxModels`
    );
    const perProvider = new Map();
    for (const entry of result.models) {
      const prefix = entry.model.split("/")[0];
      perProvider.set(prefix, (perProvider.get(prefix) ?? 0) + 1);
    }
    for (const [prefix, count] of perProvider) {
      assert.ok(
        count <= template.selector.maxPerProvider,
        `${template.id}: ${prefix} took ${count} > ${template.selector.maxPerProvider}`
      );
    }
  }
});

test("balanced interleaves providers rather than draining one", () => {
  const result = resolve("balanced", {
    groups: [OPENAI, GROQ, KIRO],
    connections: [connection("openai"), connection("groq"), connection("kiro")],
  });
  assert.strictEqual(result.ok, true);
  const prefixes = result.models.map((m) => m.model.split("/")[0]);
  assert.strictEqual(new Set(prefixes).size, prefixes.length, "one model per provider at cap 1");
});

// ──────────────── Custom provider nodes ────────────────

const NODE_GROUP = group("openai-compatible-1", "mynode", ["gpt-4o", "llama-3"], {
  isCustom: true,
  hasModels: true,
});

test("custom-node models are eligible for the providerFilter:any templates", () => {
  for (const id of ["high-availability", "balanced"]) {
    const result = resolve(id, {
      groups: [NODE_GROUP],
      connections: [connection("openai-compatible-1")],
    });
    assert.strictEqual(result.ok, true, `${id} must accept a custom node`);
    assert.ok(result.models.every((m) => m.model.startsWith("mynode/")));
  }
});

test("custom-node models are excluded from the billing-sensitive templates", () => {
  for (const id of ["free-stack", "paid-premium"]) {
    const result = resolve(id, {
      groups: [NODE_GROUP],
      connections: [connection("openai-compatible-1")],
      // even a zero price must not smuggle a node into free-stack via tier B
      pricing: { mynode: { "gpt-4o": { input: 0 }, "llama-3": { input: 0 } } },
    });
    assert.strictEqual(result.ok, false, `${id} must not select custom-node models`);
  }
});

test("a custom node is eligible for cost-saver when the user has pricing for it", () => {
  const result = resolve("cost-saver", {
    groups: [NODE_GROUP],
    connections: [connection("openai-compatible-1")],
    pricing: { mynode: { "gpt-4o": { input: 2 } } },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(
    result.models.map((m) => m.model),
    ["mynode/gpt-4o"]
  );
});

// ──────────────── Vendor-prefixed ids ────────────────

test("NVIDIA vendor-prefixed ids emit three-segment values that round-trip", () => {
  const nvidia = group("nvidia", "nvidia", [
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.3-70b-instruct",
  ]);
  const result = resolve("free-stack", {
    groups: [nvidia],
    connections: [connection("nvidia")],
  });
  assert.strictEqual(result.ok, true);
  for (const entry of result.models) {
    assert.strictEqual(entry.model.split("/").length, 3);
    const split = splitModelString(entry.model);
    assert.ok(split);
    assert.strictEqual(split.providerRef, "nvidia");
  }
});

// ──────────────── Cross-cutting guarantees ────────────────

const RICH = {
  groups: [KIRO, QODER, GROQ, OPENAI, CURSOR, ANTIGRAVITY],
  connections: [
    connection("kiro"),
    connection("qoder"),
    connection("groq"),
    connection("openai"),
    connection("cursor"),
    connection("antigravity"),
  ],
  pricing: {
    openai: { "gpt-4o": { input: 5 }, "gpt-4o-mini": { input: 0.6 } },
    groq: { "llama-3.3-70b-versatile": { input: 0 } },
  },
};

test("every emitted model appears verbatim in the picker's flattened model list", () => {
  const pickerValues = new Set(flattenAvailableModels(RICH.groups).map((m) => m.value));
  for (const template of COMBO_TEMPLATES) {
    const result = resolve(template.id, RICH);
    if (!result.ok) continue;
    for (const entry of result.models) {
      assert.ok(
        pickerValues.has(entry.model),
        `${template.id} emitted ${entry.model}, which the picker would not offer`
      );
    }
  }
});

test("resolveTemplate is deterministic", () => {
  for (const template of COMBO_TEMPLATES) {
    assert.deepStrictEqual(resolve(template.id, RICH), resolve(template.id, RICH));
  }
});

// Recomputes ComboFormModal's block chain (:148-178) over the resolved output.
test("no template can produce a save-blocked combo", () => {
  for (const template of COMBO_TEMPLATES) {
    const result = resolve(template.id, RICH);
    assert.strictEqual(result.ok, true, `${template.id} must resolve against a rich fixture`);

    const models = result.models;
    const activeModels = models.filter((m) => !m.disabled);
    const weightTotal = activeModels.reduce((sum, m) => sum + (m.weight || 0), 0);
    const pricedModelCount = activeModels.reduce((count, m) => {
      const [prefix, ...rest] = m.model.split("/");
      return count + (RICH.pricing?.[prefix]?.[rest.join("/")] ? 1 : 0);
    }, 0);

    const hasNoModels = models.length === 0;
    const hasNoActiveModels = activeModels.length === 0;
    const hasRoundRobinSingleModel =
      template.strategy === "round-robin" && activeModels.length === 1;
    const hasCostOptimizedWithoutPricing =
      template.strategy === "cost-optimized" && activeModels.length > 0 && pricedModelCount === 0;
    const hasInvalidWeightedTotal =
      template.strategy === "weighted" && activeModels.length > 0 && weightTotal !== 100;

    const saveBlocked =
      hasNoModels || hasNoActiveModels || hasInvalidWeightedTotal || hasCostOptimizedWithoutPricing;

    assert.strictEqual(saveBlocked, false, `${template.id} resolves to a save-blocked combo`);
    assert.strictEqual(
      hasRoundRobinSingleModel,
      false,
      `${template.id} resolves to a round-robin combo with one model`
    );
  }
});

test("no template is a no-op — all five produce models against a rich fixture", () => {
  assert.strictEqual(COMBO_TEMPLATES.length, 5);
  for (const template of COMBO_TEMPLATES) {
    const result = resolve(template.id, RICH);
    assert.strictEqual(result.ok, true);
    assert.ok(result.models.length > 0, `${template.id} produced no models`);
    assert.strictEqual(result.requested, template.selector.maxModels);
  }
});

test("no template carries a static isFeatured flag", () => {
  for (const template of COMBO_TEMPLATES) {
    assert.strictEqual(template.isFeatured, undefined, `${template.id} must not be featured`);
  }
});
