/**
 * What a Kimi Code config write is allowed to touch.
 *
 * ~/.kimi-code/config.toml holds the user's whole setup: the OAuth-provisioned
 * `[providers."managed:kimi-code"]` block that /login wrote, permission rules, hooks, and
 * their own providers. A write that reserialized the file or replaced the providers table
 * would cost them all of it, and Reset cannot bring it back. These tests pin the splice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const {
  applyRoutiformKimiConfig,
  removeRoutiformKimiConfig,
  hasRoutiformKimiConfig,
  toKimiModelAlias,
  KIMI_DEFAULT_CONTEXT_SIZE,
} = await import("../../src/shared/services/kimiConfigToml.ts");

const EXISTING = `default_model = "kimi-code/k3"
default_permission_mode = "manual"

[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
api_key = ""

[models."kimi-code/k3"]
provider = "managed:kimi-code"
model = "k3"
max_context_size = 1048576

[[permission.rules]]
decision = "deny"
pattern = "Bash(rm -rf*)"
`;

const INPUT = {
  baseUrl: "http://localhost:20128",
  apiKey: "sk_test",
  model: "gpt-5",
};

test("the provider block is written with the openai protocol and a /v1 base url", () => {
  const config = applyRoutiformKimiConfig("", INPUT);

  assert.match(config, /\[providers\.routiform]/);
  assert.match(config, /type = "openai"/);
  assert.match(config, /base_url = "http:\/\/localhost:20128\/v1"/);
  assert.match(config, /api_key = "sk_test"/);
});

test("a base url that already ends in /v1 is not doubled", () => {
  const config = applyRoutiformKimiConfig("", { ...INPUT, baseUrl: "http://localhost:20128/v1/" });

  assert.match(config, /base_url = "http:\/\/localhost:20128\/v1"/);
  assert.doesNotMatch(config, /v1\/v1/);
});

test("every selected model becomes its own quoted alias section", () => {
  const config = applyRoutiformKimiConfig("", {
    ...INPUT,
    models: ["gpt-5", "claude-sonnet-4-5"],
    contextLengths: { "gpt-5": 400000 },
  });

  assert.match(config, /\[models\."routiform\/gpt-5"]/);
  assert.match(config, /\[models\."routiform\/claude-sonnet-4-5"]/);
  assert.match(config, /max_context_size = 400000/);
  // Kimi rejects a model entry without a window, so an unresolved one takes its own default.
  assert.match(config, new RegExp(`max_context_size = ${KIMI_DEFAULT_CONTEXT_SIZE}`));
  assert.match(config, /default_model = "routiform\/gpt-5"/);
});

test("the user's own providers, models and rules survive the write untouched", () => {
  const config = applyRoutiformKimiConfig(EXISTING, INPUT);

  assert.match(config, /\[providers\."managed:kimi-code"]/);
  assert.match(config, /\[models\."kimi-code\/k3"]/);
  assert.match(config, /max_context_size = 1048576/);
  assert.match(config, /\[\[permission\.rules]]/);
  assert.match(config, /pattern = "Bash\(rm -rf\*\)"/);
  assert.match(config, /default_permission_mode = "manual"/);
});

test("re-saving with fewer models drops the alias that is no longer selected", () => {
  const first = applyRoutiformKimiConfig(EXISTING, {
    ...INPUT,
    models: ["gpt-5", "claude-sonnet-4-5"],
  });
  const second = applyRoutiformKimiConfig(first, { ...INPUT, models: ["gpt-5"] });

  assert.match(second, /\[models\."routiform\/gpt-5"]/);
  assert.doesNotMatch(second, /routiform\/claude-sonnet-4-5/);
  // And it still did not stack a second provider block or default_model line.
  assert.equal(second.match(/\[providers\.routiform]/g).length, 1);
  assert.equal(second.match(/^default_model = /gm).length, 1);
});

test("reset removes the Routiform scope and nothing else", () => {
  const saved = applyRoutiformKimiConfig(EXISTING, { ...INPUT, models: ["gpt-5", "o3"] });
  const reset = removeRoutiformKimiConfig(saved);

  assert.doesNotMatch(reset, /routiform/);
  assert.match(reset, /\[providers\."managed:kimi-code"]/);
  assert.match(reset, /\[models\."kimi-code\/k3"]/);
  assert.match(reset, /\[\[permission\.rules]]/);
});

test("reset keeps a default_model the user has since pointed elsewhere", () => {
  const saved = applyRoutiformKimiConfig(EXISTING, INPUT);
  const userPicked = saved.replace(
    /default_model = "routiform\/gpt-5"/,
    'default_model = "kimi-code/k3"'
  );

  assert.match(removeRoutiformKimiConfig(userPicked), /default_model = "kimi-code\/k3"/);
});

test("a missing base url is refused rather than written as a bare /v1", () => {
  // baseUrl is optional on the shared save schema, so the writer is the last line of defence.
  assert.throws(() => applyRoutiformKimiConfig("", { model: "gpt-5" }), /http\(s\) URL/);
  assert.throws(
    () => applyRoutiformKimiConfig("", { ...INPUT, baseUrl: "localhost:20128" }),
    /http\(s\) URL/
  );
});

test("a model id that would break out of the section header is refused", () => {
  assert.throws(
    () => applyRoutiformKimiConfig("", { ...INPUT, model: 'evil"]\ndefault_model = "hijacked' }),
    /cannot contain/
  );
});

test("the status check reads the provider block, not the default model alone", () => {
  assert.equal(hasRoutiformKimiConfig(applyRoutiformKimiConfig("", INPUT)), true);
  assert.equal(hasRoutiformKimiConfig(EXISTING), false);
  assert.equal(hasRoutiformKimiConfig(null), false);
  assert.equal(hasRoutiformKimiConfig('default_model = "routiform/gpt-5"\n'), false);
});

test("the alias namespaces the model so /model shows which entries Routiform owns", () => {
  assert.equal(toKimiModelAlias("gpt-5"), "routiform/gpt-5");
});

const { resolveKimiConfigPath } = await import("../../src/shared/services/cliRuntime.ts");

test("the write lands in the directory KIMI_CODE_HOME points at", () => {
  assert.equal(
    resolveKimiConfigPath({ KIMI_CODE_HOME: "/tmp/kimi-home" }, "/home/user"),
    path.join("/tmp/kimi-home", "config.toml")
  );
});

test("without the override it falls back to ~/.kimi-code/config.toml", () => {
  assert.equal(
    resolveKimiConfigPath({}, "/home/user"),
    path.join("/home/user", ".kimi-code", "config.toml")
  );
});

test("a relative KIMI_CODE_HOME is ignored rather than resolved against the process cwd", () => {
  assert.equal(
    resolveKimiConfigPath({ KIMI_CODE_HOME: "../elsewhere" }, "/home/user"),
    path.join("/home/user", ".kimi-code", "config.toml")
  );
});
