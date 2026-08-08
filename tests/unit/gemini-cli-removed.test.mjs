/**
 * The gemini-cli provider was removed (Google restricts third-party OAuth usage
 * for Gemini CLI). Its neighbour — `gemini`, the Google AI Studio API-key
 * provider — is a different provider that stays.
 *
 * Two files under src/lib/oauth were named `gemini.ts` but belonged to
 * gemini-cli, so a re-addition is easy to get backwards. This test pins both
 * halves: the CLI provider is gone AND the API-key provider still works.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { AI_PROVIDERS, FREE_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } =
  await import("../../src/shared/constants/providers.ts");
const { REGISTRY } = await import("../../open-sse/config/providerRegistry.ts");
const { DEFAULT_PRICING } = await import("../../src/shared/constants/pricing.ts");
const { GEMINI_LIKE_FORMATS } = await import("../../src/lib/providers/validation/constants.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { PROVIDERS: OAUTH_FLOWS } = await import("../../src/lib/oauth/providers/index.ts");
const { IMPLEMENTED_CLI_FINGERPRINT_PROVIDER_IDS, CLI_COMPAT_DISPLAY_PROVIDER_IDS } =
  await import("../../src/shared/constants/cliCompatProviders.ts");

test("the gemini-cli provider is absent from every provider table", () => {
  assert.equal(AI_PROVIDERS["gemini-cli"], undefined);
  assert.equal(FREE_PROVIDERS["gemini-cli"], undefined);
  assert.equal(REGISTRY["gemini-cli"], undefined);
  assert.ok(!USAGE_SUPPORTED_PROVIDERS.includes("gemini-cli"));
});

// Pricing is the one table that deliberately keeps the key: cost for historical
// usage rows is recomputed from it at read time, so dropping it would report $0
// for every gemini-cli request the user ever made. Same reason `if` is kept.
test("gemini-cli pricing is retained for historical cost lookup", () => {
  assert.ok(DEFAULT_PRICING["gemini-cli"], "removing this silently zeroes past cost");
  assert.ok(DEFAULT_PRICING["gemini-cli"]["gemini-2.5-pro"]);
});

// The neighbouring `gemini` provider was removed later and for an unrelated reason; that
// removal is pinned by tests/unit/gemini-provider-removed.test.mjs. What survives BOTH
// removals is the format, because antigravity runs on it.
test("the gemini API-key provider was removed too, but the format survives", () => {
  assert.equal(AI_PROVIDERS.gemini, undefined);
  assert.equal(REGISTRY.gemini, undefined);
  assert.ok(DEFAULT_PRICING.gemini, "pricing stays: historical cost is recomputed from it");
});

test("the gemini-cli format and its OAuth flow are gone", () => {
  assert.equal(FORMATS.GEMINI_CLI, undefined);
  assert.equal(FORMATS.GEMINI, "gemini", "the shared Gemini format stays");
  assert.equal(OAUTH_FLOWS["gemini-cli"], undefined);
  assert.deepEqual(
    [...GEMINI_LIKE_FORMATS],
    ["gemini"],
    "only the API-key provider's format is gemini-like now"
  );
});

// The ACP agent entry is not asserted here: AGENT_DEFINITIONS is module-private
// and the public accessors shell out to `<binary> --version`, which a unit test
// must not do.
test("the CLI fingerprint surface is gone", () => {
  assert.ok(!IMPLEMENTED_CLI_FINGERPRINT_PROVIDER_IDS.includes("gemini-cli"));
  assert.ok(!CLI_COMPAT_DISPLAY_PROVIDER_IDS.includes("gemini-cli"));
});
