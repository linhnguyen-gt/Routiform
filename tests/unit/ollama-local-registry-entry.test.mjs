import test from "node:test";
import assert from "node:assert/strict";

/**
 * `LOCAL_PROVIDERS` was `{}`, which read as "we ship no local inference". Chat against a local
 * Ollama already worked — `BaseExecutor.execute` uses plain `fetch` with no URL policy — so what
 * was missing was not the capability but the preset, and the two `safeOutboundFetch` call sites
 * that made model listing and validation possible.
 */

const { LOCAL_PROVIDERS } = await import("../../open-sse/config/registry-providers-local.ts");
const { REGISTRY } = await import("../../open-sse/config/registry-providers.ts");
const { getRegistryEntry } = await import("../../open-sse/config/registry-lookup.ts");
const { getExecutorKeys, DEFAULT_EXECUTOR_SENTINEL, getExecutor } =
  await import("../../open-sse/executors/index.ts");
const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.ts");

test("LOCAL_PROVIDERS is no longer empty", () => {
  assert.ok(Object.keys(LOCAL_PROVIDERS).length > 0);
  assert.ok("ollama-local" in LOCAL_PROVIDERS);
});

test("ollama-local resolves through the registry, by id and by alias", () => {
  assert.ok(REGISTRY["ollama-local"], "the aggregated registry must carry it");
  assert.equal(getRegistryEntry("ollama-local")?.id, "ollama-local");
  assert.equal(getRegistryEntry("ol")?.id, "ollama-local");
});

test("its executor value is truthful, per the executor-field-integrity rule", () => {
  const validKeys = new Set([...getExecutorKeys(), DEFAULT_EXECUTOR_SENTINEL]);
  assert.ok(validKeys.has(LOCAL_PROVIDERS["ollama-local"].executor));
  assert.equal(LOCAL_PROVIDERS["ollama-local"].executor, DEFAULT_EXECUTOR_SENTINEL);
});

test("the sentinel resolves to a constructed default executor, not a missing one", () => {
  const executor = getExecutor("ollama-local");
  assert.ok(executor, "getExecutor must construct a DefaultExecutor for it");
  assert.equal(typeof executor.execute, "function");
});

test("it defaults to Ollama's OpenAI-compatible endpoint on the standard port", () => {
  const entry = LOCAL_PROVIDERS["ollama-local"];
  assert.equal(entry.format, "openai");
  assert.match(entry.baseUrl, /^http:\/\/localhost:11434\/v1\//);
  assert.equal(entry.modelsUrl, "http://localhost:11434/v1/models");
});

test("it needs no credential", () => {
  const entry = LOCAL_PROVIDERS["ollama-local"];
  assert.equal(entry.authType, "none");
  assert.equal(entry.authHeader, "none");
});

test("model discovery is passthrough — the catalog is whatever the operator pulled", () => {
  const entry = LOCAL_PROVIDERS["ollama-local"];
  assert.equal(entry.passthroughModels, true);
  assert.deepEqual(entry.models, []);
});

test("the UI carries matching metadata", () => {
  const ui = AI_PROVIDERS["ollama-local"];
  assert.ok(ui, "the dashboard provider list must know about it");
  assert.equal(ui.alias, LOCAL_PROVIDERS["ollama-local"].alias);
  assert.equal(ui.passthroughModels, true);
  assert.ok(ui.name);
});
