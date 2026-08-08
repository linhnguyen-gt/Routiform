import test from "node:test";
import assert from "node:assert/strict";

import { COMBO_TEMPLATES } from "../../src/app/(dashboard)/dashboard/combos/components/combo-constants.ts";
import { resolveTemplate } from "../../src/app/(dashboard)/dashboard/combos/components/combo-template-resolver.ts";
import { validateComboModels } from "../../src/shared/validation/combo-model-validation.ts";

/**
 * The contract between the template resolver and the save-time validator: the app must
 * never warn about a model it just recommended. Both sides read different sources — the
 * resolver reads the live picker derivation, the validator reads the static catalog — so
 * this has to be asserted, not assumed. It fails if either phase drifts.
 */

/** Build an AvailableModelGroup the way deriveAvailableModels would. */
function group(providerId, alias, modelIds) {
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
  };
}

function connection(provider) {
  return {
    id: `conn-${provider}`,
    provider,
    credentialsConfigured: true,
    testStatus: "unknown",
    isActive: 1,
  };
}

// A generously-provisioned account: one free-OAuth, one free-tier, one paid API key, and
// two paid OAuth subscriptions — enough for all five templates to resolve. Gemini models
// come from antigravity now; the `gemini` provider itself was removed.
const GROUPS = [
  group("kiro", "kr", ["claude-sonnet-4.5", "claude-haiku-4.5"]),
  group("groq", "groq", ["llama-3.3-70b-versatile", "qwen/qwen3-32b"]),
  group("openai", "openai", ["gpt-4o", "gpt-4o-mini"]),
  group("claude", "claude", ["claude-sonnet-5", "claude-opus-5"]),
  group("antigravity", "antigravity", ["gemini-3-pro-high", "claude-sonnet-4-6"]),
];

const CONNECTIONS = GROUPS.map((g) => connection(g.providerId));

const PRICING = {
  openai: { "gpt-4o": { input: 2.5, output: 10 }, "gpt-4o-mini": { input: 0.15, output: 0.6 } },
  groq: { "llama-3.3-70b-versatile": { input: 0, output: 0 } },
};

const VALIDATION_CONTEXT = {
  knownComboNames: new Set(),
  knownModelAliases: new Set(),
  knownNodePrefixes: new Set(),
  stripModelPrefix: false,
};

for (const template of COMBO_TEMPLATES) {
  test(`"${template.id}" resolves to models that save without warnings`, () => {
    const resolution = resolveTemplate({
      template,
      groups: GROUPS,
      connections: CONNECTIONS,
      pricingByProvider: PRICING,
      providerNodes: [],
    });

    assert.ok(resolution.ok, `template ${template.id} must resolve for this fixture account`);
    assert.ok(resolution.models.length > 0);

    const result = validateComboModels({
      ...VALIDATION_CONTEXT,
      models: resolution.models.map((m) => ({ model: m.model, weight: m.weight })),
    });

    assert.deepStrictEqual(result.errors, [], `${template.id} produced save errors`);
    assert.deepStrictEqual(result.warnings, [], `${template.id} warned about its own output`);
  });
}
