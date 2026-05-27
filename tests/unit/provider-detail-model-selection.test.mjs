import test from "node:test";
import assert from "node:assert/strict";

const { selectProviderDetailModels } =
  await import("../../src/app/(dashboard)/dashboard/providers/[id]/hooks/useProviderDetailModels.ts");

test("provider detail uses fetched antigravity catalog instead of registry or sync deltas", () => {
  const models = selectProviderDetailModels({
    providerId: "antigravity",
    isLiveCatalogProvider: false,
    registryModels: [
      { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
      { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)" },
    ],
    syncedModels: [{ id: "gpt-oss-120b", name: "GPT-OSS-120b" }],
    syncedAvailableModels: [],
    opencodeLiveCatalog: {
      status: "ready",
      models: [
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
        { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
        { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium)" },
        { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)" },
        { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
        { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
      ],
      errorMessage: "",
    },
  });

  assert.deepEqual(
    models.map((model) => model.id),
    [
      "claude-sonnet-4-6",
      "gemini-3-flash-agent",
      "gemini-3.5-flash-low",
      "gemini-pro-agent",
      "gemini-3.1-pro-low",
      "gpt-oss-120b-medium",
    ]
  );
});

test("provider detail does not flash antigravity registry placeholders before catalog loads", () => {
  const models = selectProviderDetailModels({
    providerId: "antigravity",
    isLiveCatalogProvider: false,
    registryModels: [{ id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" }],
    syncedModels: [{ id: "gpt-oss-120b", name: "GPT-OSS-120b" }],
    syncedAvailableModels: [],
    opencodeLiveCatalog: { status: "loading", models: [], errorMessage: "" },
  });

  assert.deepEqual(models, []);
});

test("provider detail uses fetched claude catalog instead of registry or sync deltas", () => {
  const models = selectProviderDetailModels({
    providerId: "claude",
    isLiveCatalogProvider: true,
    registryModels: [{ id: "claude-opus-4-6", name: "Registry Claude Opus 4.6" }],
    syncedModels: [{ id: "claude-old", name: "Old Claude" }],
    syncedAvailableModels: [],
    opencodeLiveCatalog: {
      status: "ready",
      models: [
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
        { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      ],
      errorMessage: "",
    },
  });

  assert.deepEqual(models, [
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  ]);
});

test("provider detail does not show stale claude registry placeholders while api catalog loads", () => {
  const models = selectProviderDetailModels({
    providerId: "claude",
    isLiveCatalogProvider: true,
    registryModels: [{ id: "claude-opus-4-6", name: "Registry Claude Opus 4.6" }],
    syncedModels: [{ id: "claude-old", name: "Old Claude" }],
    syncedAvailableModels: [],
    opencodeLiveCatalog: { status: "loading", models: [], errorMessage: "" },
  });

  assert.deepEqual(models, []);
});

test("provider detail still uses synced-only models when no static registry exists", () => {
  const models = selectProviderDetailModels({
    providerId: "custom-provider",
    isLiveCatalogProvider: false,
    registryModels: [],
    syncedModels: [{ id: "custom-model", name: "Custom Model" }],
    syncedAvailableModels: [],
    opencodeLiveCatalog: { status: "idle", models: [], errorMessage: "" },
  });

  assert.deepEqual(models, [{ id: "custom-model", name: "Custom Model" }]);
});

test("provider detail keeps gemini sourced from synced available models", () => {
  const models = selectProviderDetailModels({
    providerId: "gemini",
    isLiveCatalogProvider: false,
    registryModels: [{ id: "gemini-3-flash", name: "Registry Gemini 3 Flash" }],
    syncedModels: [{ id: "ignored", name: "Ignored" }],
    syncedAvailableModels: [{ id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" }],
    opencodeLiveCatalog: { status: "idle", models: [], errorMessage: "" },
  });

  assert.deepEqual(models, [{ id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" }]);
});
