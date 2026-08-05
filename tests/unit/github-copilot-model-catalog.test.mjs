import test from "node:test";
import assert from "node:assert/strict";

/**
 * The GitHub Copilot catalog has one source: `src/shared/constants/github-copilot-models.ts`.
 *
 * It used to have two — `OAUTH_PROVIDERS.github.models` and the dashboard's
 * `OFFICIAL_GITHUB_COPILOT_MODELS` — hand-maintained side by side. They drifted to 20 and 23
 * entries with five IDs present in one and absent from the other, and both accumulated IDs
 * upstream had stopped serving. These tests make that shape unrepresentable.
 */

const { GITHUB_COPILOT_MODELS } =
  await import("../../src/shared/constants/github-copilot-models.ts");
const { OAUTH_PROVIDERS } = await import("../../open-sse/config/registry-providers-oauth.ts");
const { OFFICIAL_GITHUB_COPILOT_MODELS } =
  await import("../../src/app/api/providers/[id]/models/github-copilot-official-models.ts");
const { getModelInfoCore } = await import("../../open-sse/services/model.ts");

const CATALOG_IDS = GITHUB_COPILOT_MODELS.map((m) => m.id);

test("the routing registry and the dashboard catalog list the same models", () => {
  const registryIds = OAUTH_PROVIDERS.github.models.map((m) => m.id);
  const dashboardIds = OFFICIAL_GITHUB_COPILOT_MODELS.map((m) => m.id);

  assert.deepEqual(registryIds, CATALOG_IDS, "registry must derive from the shared catalog");
  assert.deepEqual(dashboardIds, CATALOG_IDS, "dashboard must derive from the shared catalog");
});

test("no model ID appears twice", () => {
  assert.equal(new Set(CATALOG_IDS).size, CATALOG_IDS.length);
});

test("every alias target is a model the catalog still carries", async () => {
  // An alias pointing at a retired ID turns a request that might have worked into a
  // guaranteed 404 — the failure that put `antigravity/gpt-oss-120b-medium` on the floor.
  // Aliases are read through getModelInfoCore because that is the only path callers take.
  const aliasedInputs = [
    "gpt-5",
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5-codex",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
    "gpt-5.1-codex-max",
    "gpt-5.2-codex",
    "claude-4.5-opus",
    "claude-opus-4-5-20251101",
    "claude-opus-4.1",
    "claude-opus-4.6",
    "claude-opus-4.6-fast",
    "claude-sonnet-4",
    "gemini-3-pro",
    "gemini-3-pro-preview",
    "gemini-3-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "grok-code-fast-1",
    "goldeneye",
    "raptor-mini",
  ];

  for (const input of aliasedInputs) {
    const resolved = await getModelInfoCore(`gh/${input}`, {});
    assert.equal(resolved.provider, "github");
    assert.ok(
      CATALOG_IDS.includes(resolved.model),
      `gh/${input} resolves to "${resolved.model}", which the catalog does not carry`
    );
  }
});

test("IDs upstream still serves are not rewritten to something else", async () => {
  // gpt-4o and friends were aliased away on the assumption they had been withdrawn.
  // They had not been, so the alias silently answered with a model nobody asked for.
  for (const id of ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo", ...CATALOG_IDS]) {
    const resolved = await getModelInfoCore(`gh/${id}`, {});
    assert.equal(resolved.model, id, `gh/${id} must reach the executor unchanged`);
  }
});

test("only /responses-exclusive models carry targetFormat", () => {
  // Copilot answers 400 unsupported_api_for_model when a model is sent to the wrong
  // endpoint, in both directions. Anthropic serves /v1/messages and /chat/completions and
  // never /responses, so no Anthropic entry may be flagged.
  const responsesOnly = GITHUB_COPILOT_MODELS.filter((m) => m.targetFormat);
  for (const m of responsesOnly) {
    assert.equal(m.targetFormat, "openai-responses");
    assert.notEqual(m.vendor, "anthropic", `${m.id} is Anthropic and cannot use /responses`);
  }

  // gpt-5.4 serves both and stays on chat/completions; its siblings are responses-only.
  const byId = Object.fromEntries(GITHUB_COPILOT_MODELS.map((m) => [m.id, m]));
  assert.equal(byId["gpt-5.4"].targetFormat, undefined);
  assert.equal(byId["gpt-5.5"].targetFormat, "openai-responses");
  assert.equal(byId["gpt-5.3-codex"].targetFormat, "openai-responses");
});

test("registry entries keep their local request tuning through the derivation", () => {
  const codex = OAUTH_PROVIDERS.github.models.find((m) => m.id === "gpt-5.3-codex");
  assert.deepEqual(codex.defaultParams, { reasoning: { effort: "high" } });
});

test("catalog metadata survives into both views", () => {
  const opus = GITHUB_COPILOT_MODELS.find((m) => m.id === "claude-opus-4.8");
  assert.equal(opus.thinking, true);
  assert.equal(opus.contextLength, 264000);
  assert.equal(opus.maxOutputTokens, 64000);

  const registryOpus = OAUTH_PROVIDERS.github.models.find((m) => m.id === "claude-opus-4.8");
  assert.equal(registryOpus.thinking, true);
  assert.equal(registryOpus.contextLength, 264000);
  assert.equal(registryOpus.maxOutputTokens, 64000);

  const dashboardOpus = OFFICIAL_GITHUB_COPILOT_MODELS.find((m) => m.id === "claude-opus-4.8");
  assert.equal(dashboardOpus.supportsThinking, true);
  assert.equal(dashboardOpus.owned_by, "anthropic");
  assert.equal(dashboardOpus.inputTokenLimit, 264000);
  assert.equal(dashboardOpus.outputTokenLimit, 64000);
});

test("preview models are labelled as preview in both views", () => {
  const preview = GITHUB_COPILOT_MODELS.filter((m) => m.preview).map((m) => m.id);
  assert.ok(preview.includes("claude-opus-4.8-fast"));

  for (const id of preview) {
    const registryName = OAUTH_PROVIDERS.github.models.find((m) => m.id === id).name;
    const dashboardName = OFFICIAL_GITHUB_COPILOT_MODELS.find((m) => m.id === id).name;
    assert.match(registryName, /\(preview\)$/);
    assert.match(dashboardName, /\(preview\)$/);
  }
});
