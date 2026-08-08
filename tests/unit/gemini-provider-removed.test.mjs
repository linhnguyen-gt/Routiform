/**
 * The `gemini` provider (Google AI Studio, API key) was removed. Its neighbour — the
 * Gemini request FORMAT — was not, and must never be: antigravity runs on it.
 *
 * That split is the whole reason this file exists. A grep for "gemini" hits 80+ files,
 * almost all of them Gemini MODEL IDS served by antigravity, GitHub Copilot and Cline, or
 * translator code named after the format. Anyone re-adding or further removing "gemini"
 * needs both halves pinned so the sweep cannot go one file too far.
 *
 * Note the two removals are unrelated: migration 028 dropped `gemini-cli` (Google
 * restricting third-party OAuth), migration 029 drops `gemini` (dead in practice — every
 * request it served returned 400/502).
 */
import test from "node:test";
import assert from "node:assert/strict";

const { AI_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS } =
  await import("../../src/shared/constants/providers.ts");
const { REGISTRY } = await import("../../open-sse/config/providerRegistry.ts");
const { DEFAULT_PRICING } = await import("../../src/shared/constants/pricing.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { GEMINI_LIKE_FORMATS } = await import("../../src/lib/providers/validation/constants.ts");
const { VIDEO_PROVIDERS } = await import("../../open-sse/config/videoRegistry.ts");
const { FREE_TIER_CATALOG } = await import("../../src/shared/constants/freeTierCatalog.ts");
const { PROVIDER_COLORS, PROTOCOL_COLORS } = await import("../../src/shared/constants/colors.ts");

test("the gemini provider is absent from every provider table", () => {
  assert.equal(AI_PROVIDERS.gemini, undefined);
  assert.equal(APIKEY_PROVIDERS.gemini, undefined);
  assert.equal(FREE_PROVIDERS.gemini, undefined);
  assert.equal(REGISTRY.gemini, undefined);
  assert.equal(PROVIDER_COLORS.gemini, undefined);
  assert.ok(
    !FREE_TIER_CATALOG.some((entry) => entry.providerId === "gemini"),
    "the free-tier catalog must not advertise a provider that no longer exists"
  );
});

test("the Gemini request format survives, because antigravity runs on it", () => {
  assert.equal(FORMATS.GEMINI, "gemini");
  assert.deepEqual([...GEMINI_LIKE_FORMATS], ["gemini"]);
  assert.equal(
    PROTOCOL_COLORS.gemini?.label,
    "Gemini",
    "PROTOCOL_COLORS keys are formats, not providers — this one stays"
  );

  const antigravity = REGISTRY.antigravity;
  assert.ok(antigravity, "antigravity must still be registered");
  assert.equal(antigravity.executor, "antigravity");
});

test("gemini pricing is retained for historical cost lookup", () => {
  // Cost is recomputed from this table at read time (`getPricingForModel`), so dropping
  // the key would silently report $0 for every gemini request the user ever made.
  assert.ok(DEFAULT_PRICING.gemini, "removing this silently zeroes past cost");
});

test("Veo video generation is gone and the remaining video providers are local", () => {
  assert.equal(VIDEO_PROVIDERS.gemini, undefined);
  const formats = Object.values(VIDEO_PROVIDERS).map((provider) => provider.format);
  assert.ok(!formats.includes("gemini-veo"), "the Veo branch must be gone with its provider");
  assert.ok(Object.keys(VIDEO_PROVIDERS).length > 0, "video generation still has providers");
  for (const provider of Object.values(VIDEO_PROVIDERS)) {
    assert.equal(
      provider.authType,
      "none",
      `${provider.id} needs credentials, but the media page now declares video needs none`
    );
  }
});
