/**
 * Qwen Code settings.json.
 *
 * Qwen's shape differs from every other tool here: `modelProviders` is keyed by auth type
 * and each value is an ARRAY of model entries, the key is never stored in the file (only
 * the name of the variable holding it), and the entry is inert unless `model.name` and
 * `security.auth.selectedType` both point at it.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  QWEN_API_KEY_ENV,
  applyRoutiformQwenConfig,
  buildQwenModelEntries,
  hasRoutiformQwenConfig,
  removeRoutiformQwenConfig,
} = await import("../../src/shared/services/qwenConfig.ts");

const BASE_URL = "http://127.0.0.1:20128/v1";
const LOCAL_HOSTS = ["localhost:20128", "127.0.0.1:20128"];
const OPTS = { localHosts: LOCAL_HOSTS };

test("an entry names the env variable and never the key itself", () => {
  const [entry] = buildQwenModelEntries({ baseUrl: BASE_URL, model: "cx/gpt-5.4" });

  assert.equal(entry.id, "cx/gpt-5.4");
  assert.equal(entry.envKey, QWEN_API_KEY_ENV);
  assert.equal(entry.baseUrl, BASE_URL);
  assert.equal(JSON.stringify(entry).includes("sk"), false);
});

test("a known context window becomes generationConfig.contextWindowSize", () => {
  const [entry] = buildQwenModelEntries({
    baseUrl: BASE_URL,
    model: "cx/gpt-5.4",
    contextLengths: { "cx/gpt-5.4": 300000 },
  });

  assert.equal(entry.generationConfig.contextWindowSize, 300000);
});

test("an unknown window writes no generationConfig at all", () => {
  const [entry] = buildQwenModelEntries({ baseUrl: BASE_URL, model: "cx/gpt-5.4" });

  // generationConfig applies atomically, so a placeholder would mask Qwen's own default.
  assert.equal("generationConfig" in entry, false);
});

test("every selected model gets its own entry, deduplicated", () => {
  const entries = buildQwenModelEntries({
    baseUrl: BASE_URL,
    model: "cx/gpt-5.4",
    models: ["cx/gpt-5.4", "cc/claude-sonnet-5"],
  });

  assert.deepEqual(
    entries.map((e) => e.id),
    ["cx/gpt-5.4", "cc/claude-sonnet-5"]
  );
});

test("apply also sets the default model and the auth type", () => {
  const config = applyRoutiformQwenConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" }, OPTS);

  assert.equal(config.model.name, "cx/gpt-5.4");
  assert.equal(config.security.auth.selectedType, "openai");
  assert.equal(config.modelProviders.openai.length, 1);
});

test("re-applying updates the entry instead of appending a duplicate", () => {
  const once = applyRoutiformQwenConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" }, OPTS);
  const twice = applyRoutiformQwenConfig(
    once,
    { baseUrl: BASE_URL, model: "cc/claude-sonnet-5" },
    OPTS
  );

  assert.equal(twice.modelProviders.openai.length, 1);
  assert.equal(twice.modelProviders.openai[0].id, "cc/claude-sonnet-5");
});

test("the user's own openai provider survives an apply", () => {
  const existing = {
    modelProviders: { openai: [{ id: "gpt-4o", baseUrl: "https://api.openai.com/v1" }] },
  };
  const config = applyRoutiformQwenConfig(
    existing,
    { baseUrl: BASE_URL, model: "cx/gpt-5.4" },
    OPTS
  );

  assert.equal(config.modelProviders.openai.length, 2);
  assert.equal(config.modelProviders.openai[0].id, "gpt-4o");
});

test("apply then reset leaves nothing behind", () => {
  const applied = applyRoutiformQwenConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" }, OPTS);
  const reset = removeRoutiformQwenConfig(applied, OPTS);

  assert.equal(reset.modelProviders, undefined);
  assert.equal(reset.model, undefined);
  assert.equal(reset.security, undefined);
});

test("reset keeps the user's provider, and with it the auth type that selects it", () => {
  const existing = {
    modelProviders: { openai: [{ id: "gpt-4o", baseUrl: "https://api.openai.com/v1" }] },
    ui: { theme: "dark" },
  };
  const applied = applyRoutiformQwenConfig(
    existing,
    { baseUrl: BASE_URL, model: "cx/gpt-5.4" },
    OPTS
  );
  const reset = removeRoutiformQwenConfig(applied, OPTS);

  assert.equal(reset.modelProviders.openai.length, 1);
  assert.equal(reset.modelProviders.openai[0].id, "gpt-4o");
  assert.equal(reset.security.auth.selectedType, "openai");
  assert.deepEqual(reset.ui, { theme: "dark" });
});

test("a model the user has since switched to is left alone", () => {
  const applied = applyRoutiformQwenConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" }, OPTS);
  const switched = { ...applied, model: { name: "gpt-4o" } };
  const reset = removeRoutiformQwenConfig(switched, OPTS);

  assert.equal(reset.model.name, "gpt-4o");
});

test("an entry written before the env key existed is still recognised and removed", () => {
  const legacy = {
    modelProviders: { openai: [{ id: "old", baseUrl: "http://localhost:20128/v1" }] },
  };

  assert.equal(hasRoutiformQwenConfig(legacy, OPTS), true);
  assert.equal(removeRoutiformQwenConfig(legacy, OPTS).modelProviders, undefined);
});

test("resetting a config that was never applied to is a no-op", () => {
  const untouched = {
    modelProviders: { openai: [{ id: "gpt-4o", baseUrl: "https://api.openai.com/v1" }] },
  };

  assert.equal(hasRoutiformQwenConfig(untouched, OPTS), false);
  assert.deepEqual(removeRoutiformQwenConfig(untouched, OPTS), untouched);
  assert.deepEqual(removeRoutiformQwenConfig(null, OPTS), {});
});
