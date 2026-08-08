/**
 * Kilo Code CLI writes.
 *
 * The failure this locks down is silent: Kilo decodes every auth.json entry against a
 * closed union and drops the ones that fail, so an entry with the wrong `type` leaves the
 * dashboard reporting success while the CLI sees no credential at all. The endpoint and
 * the default model have the same problem in reverse — they only take effect from
 * kilo.json, never from auth.json.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  KILO_PROVIDER_ID,
  applyRoutiformKiloAuth,
  applyRoutiformKiloConfig,
  buildKiloProvider,
  hasRoutiformKiloConfig,
  removeRoutiformKiloAuth,
  removeRoutiformKiloConfig,
  toKiloLimits,
  toKiloModelRef,
} = await import("../../src/shared/services/kiloConfig.ts");

const APPLY = { baseUrl: "http://127.0.0.1:20128/v1", model: "cx/gpt-5.4" };

test("an auth entry uses the only shape Kilo's decoder accepts", () => {
  const auth = applyRoutiformKiloAuth(null, "sk_live");
  assert.deepEqual(auth[KILO_PROVIDER_ID], { type: "api", key: "sk_live" });
});

test("auth entries carry no endpoint or model", () => {
  // Kilo ignores both here; leaving them in was what made the whole entry undecodable.
  const entry = applyRoutiformKiloAuth(null, "sk_live")[KILO_PROVIDER_ID];
  assert.deepEqual(Object.keys(entry).sort(), ["key", "type"]);
});

test("the inert entries earlier versions wrote are cleaned up on apply", () => {
  const auth = applyRoutiformKiloAuth(
    { "openai-compatible": { type: "api-key", apiKey: "sk_old" }, anthropic: { type: "api" } },
    "sk_live"
  );
  assert.equal(auth["openai-compatible"], undefined);
  assert.ok(auth.anthropic, "another provider's credential must survive");
});

test("the config carries the endpoint and the default model reference", () => {
  const config = applyRoutiformKiloConfig(null, APPLY);
  const provider = config.provider[KILO_PROVIDER_ID];

  assert.equal(provider.options.baseURL, "http://127.0.0.1:20128/v1");
  assert.equal(config.model, "routiform/cx/gpt-5.4");
  assert.equal(config.model, toKiloModelRef(APPLY.model));
  assert.ok(provider.models["cx/gpt-5.4"], "the selected model must be declared");
});

test("the config never carries the api key", () => {
  // auth.json is the credential store; duplicating the secret into a second file would
  // widen its exposure for nothing, since Kilo merges the auth entry into provider options.
  const provider = applyRoutiformKiloConfig(null, APPLY).provider[KILO_PROVIDER_ID];
  assert.equal(provider.options.apiKey, undefined);
});

test("a base url without /v1 is normalized", () => {
  const config = applyRoutiformKiloConfig(null, { ...APPLY, baseUrl: "http://127.0.0.1:20128" });
  assert.equal(config.provider[KILO_PROVIDER_ID].options.baseURL, "http://127.0.0.1:20128/v1");
});

test("other providers and unrelated settings are preserved", () => {
  const existing = {
    theme: "dark",
    provider: { anthropic: { options: { apiKey: "{env:ANTHROPIC_API_KEY}" } } },
  };
  const config = applyRoutiformKiloConfig(existing, APPLY);

  assert.equal(config.theme, "dark");
  assert.ok(config.provider.anthropic, "another provider must not be dropped");
});

test("reset removes the provider but leaves a model the user picked elsewhere", () => {
  const config = removeRoutiformKiloConfig({
    provider: { [KILO_PROVIDER_ID]: {}, anthropic: {} },
    model: "anthropic/claude-sonnet-4-5",
  });

  assert.equal(config.provider[KILO_PROVIDER_ID], undefined);
  assert.ok(config.provider.anthropic);
  assert.equal(config.model, "anthropic/claude-sonnet-4-5");
});

test("reset clears a default model that pointed at the removed provider", () => {
  const config = removeRoutiformKiloConfig(applyRoutiformKiloConfig(null, APPLY));
  assert.equal(config.model, undefined);
  assert.equal(config.provider, undefined, "an empty provider map is dropped, not left behind");
});

test("reset drops both the current and the legacy auth ids", () => {
  const auth = removeRoutiformKiloAuth({
    [KILO_PROVIDER_ID]: { type: "api", key: "sk_live" },
    "openai-compatible": { type: "api-key" },
    openai: { type: "api", key: "sk_user" },
  });

  assert.deepEqual(Object.keys(auth), ["openai"]);
});

test("hasRoutiformKiloConfig reads the config, not the credential store", () => {
  assert.equal(hasRoutiformKiloConfig(applyRoutiformKiloConfig(null, APPLY)), true);
  assert.equal(hasRoutiformKiloConfig({ provider: { [KILO_PROVIDER_ID]: {} } }), false);
  assert.equal(hasRoutiformKiloConfig(null), false);
});

test("catalog limits become Kilo's per-model limit block", () => {
  // Kilo sizes its context meter and caps output from `limit`. The route used to build the
  // provider without it, so every model was written as a bare name with no window at all.
  const limits = toKiloLimits({ [APPLY.model]: 300000 }, { [APPLY.model]: 64000 });
  assert.deepEqual(limits, { [APPLY.model]: { context: 300000, output: 64000 } });

  const provider = buildKiloProvider({ ...APPLY, limits });
  assert.deepEqual(provider.models[APPLY.model].limit, { context: 300000, output: 64000 });
});

test("a known window still lands when the output cap is unknown", () => {
  assert.deepEqual(toKiloLimits({ m: 262144 }, {}), { m: { context: 262144, output: 16384 } });
});

test("a model the catalog knows nothing about gets no limit block", () => {
  assert.deepEqual(toKiloLimits({}, { m: 64000 }), {});
  assert.equal(buildKiloProvider({ ...APPLY, limits: {} }).models[APPLY.model].limit, undefined);
});
