/**
 * Continue's config.yaml assistant file.
 *
 * config.json — and its `title` key for naming a model — is deprecated, so what this pins
 * down is the YAML shape: the three required top-level properties, and a models entry keyed
 * by `name`. The merge behaviour matters just as much: a user's other models and their own
 * assistant name have to survive a re-save.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { CONTINUE_MANAGED_FLAG, applyRoutiformContinueConfig, buildContinueModel } =
  await import("../../src/shared/services/continueConfig.ts");

const INPUT = { baseUrl: "http://127.0.0.1:20128/v1", apiKey: "sk_live", model: "cx/gpt-5.4" };

test("a model entry uses the config.yaml keys, not the deprecated ones", () => {
  const entry = buildContinueModel(INPUT);

  assert.equal(entry.name, "cx/gpt-5.4");
  assert.equal(entry.provider, "openai");
  assert.equal(entry.model, "cx/gpt-5.4");
  assert.equal(entry.apiBase, "http://127.0.0.1:20128/v1");
  assert.equal(entry.title, undefined, "`title` belongs to the deprecated config.json shape");
});

test("roles are declared so the model is usable for more than chat", () => {
  assert.deepEqual(buildContinueModel(INPUT).roles, ["chat", "edit", "apply"]);
});

test("the three required top-level properties are filled in", () => {
  const config = applyRoutiformContinueConfig(null, INPUT);
  assert.equal(config.name, "routiform");
  assert.equal(config.schema, "v1");
  assert.ok(config.version, "version is required by the v1 assistant schema");
});

test("an assistant the user already named keeps its identity", () => {
  const config = applyRoutiformContinueConfig(
    { name: "my-assistant", version: "1.2.0", schema: "v1" },
    INPUT
  );
  assert.equal(config.name, "my-assistant");
  assert.equal(config.version, "1.2.0");
});

test("re-saving updates the managed entry instead of appending a duplicate", () => {
  const first = applyRoutiformContinueConfig(null, INPUT);
  const second = applyRoutiformContinueConfig(first, { ...INPUT, model: "cc/claude-sonnet-5" });

  assert.equal(second.models.length, 1);
  assert.equal(second.models[0].model, "cc/claude-sonnet-5");
});

test("entries the user wrote are never touched", () => {
  const existing = {
    models: [
      { name: "local", provider: "ollama", model: "qwen3", apiBase: "http://localhost:11434" },
    ],
  };
  const config = applyRoutiformContinueConfig(existing, INPUT);

  assert.equal(config.models.length, 2);
  assert.equal(config.models[0].provider, "ollama");
  assert.equal(config.models[1][CONTINUE_MANAGED_FLAG], true);
});

test("an entry written before the managed flag existed is adopted, not duplicated", () => {
  // Migrated from config.json, so it carries the endpoint but none of the newer metadata.
  const legacy = { models: [{ title: "old", model: "cx/gpt-5.4", apiBase: INPUT.baseUrl }] };
  const config = applyRoutiformContinueConfig(legacy, INPUT);

  assert.equal(config.models.length, 1);
  assert.equal(config.models[0].name, "cx/gpt-5.4");
});

test("a local endpoint on a different port is recognised as ours", () => {
  const legacy = { models: [{ title: "old", apiBase: "http://localhost:9999/v1" }] };
  const config = applyRoutiformContinueConfig(legacy, INPUT, { localHosts: ["localhost:9999"] });

  assert.equal(config.models.length, 1, "the entry must be replaced, not joined by a second one");
});

test("a missing key falls back to the local default rather than writing an empty string", () => {
  assert.equal(buildContinueModel({ ...INPUT, apiKey: undefined }).apiKey, "sk_routiform");
});
