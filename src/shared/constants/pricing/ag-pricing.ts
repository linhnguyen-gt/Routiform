import { PricingRate } from "./base";

// Introductory rates published on https://ai.google.dev/gemini-api/docs/pricing:
// $0.75 in / $3.75 out / $0.075 cached per 1M through 2026-12-31, doubling to
// $1.50 / $7.50 / $0.15 on 2027-01-01. Revisit this block on that date.
const GEMINI_3_FLASH_PRICING: PricingRate = {
  input: 0.75,
  output: 3.75,
  cached: 0.075,
  reasoning: 5.625,
  cache_creation: 0.75,
};

// Antigravity advertises a Flash generation under one id per performance tier
// (see tests/unit/antigravity-model-id-passthrough.test.mjs for the live set),
// and the tier suffix reaches the executor unchanged. `getPricingForModel` is an
// exact-match lookup — it does not strip the suffix — so a bare-id entry alone
// would price every tier at $0. Rates are per generation, not per tier.
const ANTIGRAVITY_FLASH_TIERS = ["", "-extra-low", "-low", "-medium", "-high", "-tiered"];

function flashTierRates(baseId: string, rate: PricingRate): Record<string, PricingRate> {
  return Object.fromEntries(ANTIGRAVITY_FLASH_TIERS.map((tier) => [`${baseId}${tier}`, rate]));
}

export const agPricing: Record<string, PricingRate> = {
  ...flashTierRates("gemini-3.8-flash", GEMINI_3_FLASH_PRICING),
  ...flashTierRates("gemini-3.7-flash", GEMINI_3_FLASH_PRICING),
  ...flashTierRates("gemini-3.6-flash", GEMINI_3_FLASH_PRICING),
  "gemini-3.1-pro-low": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-3.1-pro-high": {
    input: 4.0,
    output: 18.0,
    cached: 0.5,
    reasoning: 27.0,
    cache_creation: 4.0,
  },
  "gemini-3-flash": {
    input: 0.5,
    output: 3.0,
    cached: 0.03,
    reasoning: 4.5,
    cache_creation: 0.5,
  },
  "gemini-3.5-flash": {
    input: 0.5,
    output: 3.0,
    cached: 0.03,
    reasoning: 4.5,
    cache_creation: 0.5,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cached: 0.3,
    reasoning: 22.5,
    cache_creation: 3.0,
  },
  "claude-opus-4-6-thinking": {
    input: 5.0,
    output: 25.0,
    cached: 0.5,
    reasoning: 37.5,
    cache_creation: 5.0,
  },
  "gpt-oss-120b-medium": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "gpt-oss-120b": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
};
