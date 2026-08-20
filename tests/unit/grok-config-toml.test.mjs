/**
 * What a Grok Build config write is allowed to touch.
 *
 * ~/.grok/config.toml holds the user's whole setup: the installer block, the marketplace
 * sources array-of-tables, MCP servers, feature flags, and their own custom models. A write
 * that reserialized the file or replaced the `[models]` table would cost them all of it,
 * and Reset cannot bring it back. These tests pin the splice.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  applyRoutiformGrokConfig,
  removeRoutiformGrokConfig,
  hasRoutiformGrokConfig,
  toGrokModelAlias,
  GROK_DEFAULT_CONTEXT_WINDOW,
} = await import("../../src/shared/services/grokConfigToml.ts");

const EXISTING = `[cli]
installer = "internal"

[marketplace]
official_marketplace_auto_installed = true

[[marketplace.sources]]
name = "xAI Official"
git = "https://github.com/xai-org/plugin-marketplace.git"

[models]
default = "grok-4.6"
web_search = "grok-4.6"

[model.company-grok]
model = "grok-build"
base_url = "https://grok-proxy.acme.com/v1"
`;

const INPUT = {
  baseUrl: "http://localhost:20128",
  apiKey: "sk_test",
  model: "gpt-5",
};

test("a model entry is written under the namespaced alias with a /v1 base url", () => {
  const config = applyRoutiformGrokConfig("", INPUT);

  assert.match(config, /\[model\."routiform\/gpt-5"]/);
  assert.match(config, /model = "gpt-5"/);
  assert.match(config, /base_url = "http:\/\/localhost:20128\/v1"/);
  assert.match(config, /api_key = "sk_test"/);
  assert.match(config, new RegExp(`context_window = ${GROK_DEFAULT_CONTEXT_WINDOW}`));
});

test("a base url that already ends in /v1 is not doubled", () => {
  const config = applyRoutiformGrokConfig("", { ...INPUT, baseUrl: "http://localhost:20128/v1/" });

  assert.match(config, /base_url = "http:\/\/localhost:20128\/v1"/);
  assert.doesNotMatch(config, /v1\/v1/);
});

test("a base url that is not http(s) is refused rather than written", () => {
  assert.throws(() => applyRoutiformGrokConfig("", { ...INPUT, baseUrl: "" }), /Base URL/);
  assert.throws(
    () => applyRoutiformGrokConfig("", { ...INPUT, baseUrl: "localhost:20128" }),
    /Base URL/
  );
});

test("a base url carrying a line break cannot smuggle a second key in", () => {
  assert.throws(
    () => applyRoutiformGrokConfig("", { ...INPUT, baseUrl: "http://localhost:20128\nrogue = 1" }),
    /Base URL/
  );
});

test("a newline in the api key is escaped, not written raw", () => {
  const config = applyRoutiformGrokConfig("", { ...INPUT, apiKey: "sk_live\nrogue = 1" });

  assert.match(config, /api_key = "sk_live\\nrogue = 1"/);
  assert.doesNotMatch(config, /^rogue = 1$/m);
});

test("a model id that would break out of the section header is refused", () => {
  assert.throws(
    () => applyRoutiformGrokConfig("", { ...INPUT, model: 'a"]\nrogue = 1' }),
    /Model id/
  );
});

test("the default is set inside [models] without disturbing the user's other keys", () => {
  const config = applyRoutiformGrokConfig(EXISTING, INPUT);

  assert.match(config, /default = "routiform\/gpt-5"/);
  assert.match(config, /web_search = "grok-4.6"/);
  assert.doesNotMatch(config, /default = "grok-4.6"/);
});

test("the user's own blocks survive the write byte for byte", () => {
  const config = applyRoutiformGrokConfig(EXISTING, INPUT);

  assert.match(config, /\[cli]\ninstaller = "internal"/);
  assert.match(config, /\[\[marketplace\.sources]]/);
  assert.match(config, /git = "https:\/\/github\.com\/xai-org\/plugin-marketplace\.git"/);
  assert.match(config, /\[model\.company-grok]/);
  assert.match(config, /base_url = "https:\/\/grok-proxy\.acme\.com\/v1"/);
});

test("every selected model gets its own entry and the resolved context window", () => {
  const config = applyRoutiformGrokConfig(EXISTING, {
    ...INPUT,
    models: ["gpt-5", "claude-sonnet-5"],
    contextLengths: { "gpt-5": 400000, "claude-sonnet-5": 200000 },
  });

  assert.match(config, /\[model\."routiform\/gpt-5"]/);
  assert.match(config, /\[model\."routiform\/claude-sonnet-5"]/);
  assert.match(config, /context_window = 400000/);
  assert.match(config, /context_window = 200000/);
});

test("deselecting a model removes its entry instead of leaving a dead alias", () => {
  const first = applyRoutiformGrokConfig(EXISTING, {
    ...INPUT,
    models: ["gpt-5", "claude-sonnet-5"],
  });
  const second = applyRoutiformGrokConfig(first, { ...INPUT, models: ["gpt-5"] });

  assert.match(second, /\[model\."routiform\/gpt-5"]/);
  assert.doesNotMatch(second, /claude-sonnet-5/);
});

test("saving twice is idempotent", () => {
  const once = applyRoutiformGrokConfig(EXISTING, INPUT);
  const twice = applyRoutiformGrokConfig(once, INPUT);

  assert.equal(twice, once);
});

test("reset removes the managed entries and clears a default that names ours", () => {
  const config = removeRoutiformGrokConfig(applyRoutiformGrokConfig(EXISTING, INPUT));

  assert.doesNotMatch(config, /routiform/);
  assert.match(config, /\[model\.company-grok]/);
  assert.match(config, /web_search = "grok-4.6"/);
  assert.match(config, /\[\[marketplace\.sources]]/);
});

test("reset keeps a default the user has since pointed back at their own model", () => {
  const saved = applyRoutiformGrokConfig(EXISTING, INPUT);
  const switchedBack = saved.replace('default = "routiform/gpt-5"', 'default = "company-grok"');

  const config = removeRoutiformGrokConfig(switchedBack);

  assert.match(config, /default = "company-grok"/);
  assert.doesNotMatch(config, /routiform/);
});

test("reset drops a [models] table it created and left empty", () => {
  const config = removeRoutiformGrokConfig(applyRoutiformGrokConfig("", INPUT));

  assert.equal(config, "");
});

test("the status probe reads a managed model entry, not the default alone", () => {
  assert.equal(hasRoutiformGrokConfig(null), false);
  assert.equal(hasRoutiformGrokConfig(EXISTING), false);
  assert.equal(hasRoutiformGrokConfig('[models]\ndefault = "routiform/gpt-5"\n'), false);
  assert.equal(hasRoutiformGrokConfig(applyRoutiformGrokConfig(EXISTING, INPUT)), true);
});

test("the alias is namespaced so the entry is recognisable in /model", () => {
  assert.equal(toGrokModelAlias("gpt-5"), "routiform/gpt-5");
});
