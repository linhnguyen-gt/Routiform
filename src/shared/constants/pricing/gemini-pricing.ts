import { PricingRate } from "./base";

/**
 * Legacy: the `gemini-cli` provider was removed, but stored usage_history and
 * call_logs rows still carry the `gemini-cli` prefix, and cost is recomputed
 * from these tables at read time (`calculateCost` -> `getPricingForModel`).
 * Dropping this table would silently report $0 for every historical row.
 */
export const geminiCliPricing: Record<string, PricingRate> = {
  "gemini-3-flash-preview": {
    input: 0.5,
    output: 3.0,
    cached: 0.03,
    reasoning: 4.5,
    cache_creation: 0.5,
  },
  "gemini-3.1-flash-lite-preview": {
    input: 0.5,
    output: 3.0,
    cached: 0.03,
    reasoning: 4.5,
    cache_creation: 0.5,
  },
  "gemini-3-pro-preview": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-3.1-pro-preview": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-2.5-pro": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cached: 0.03,
    reasoning: 3.75,
    cache_creation: 0.3,
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cached: 0.025,
    reasoning: 0.6,
    cache_creation: 0.1,
  },
};

// Gemini 3.x Flash rates below are the introductory tier published on
// https://ai.google.dev/gemini-api/docs/pricing — $0.75 in / $3.75 out /
// $0.075 cached per 1M tokens, held through 2026-12-31 and doubling to
// $1.50 / $7.50 / $0.15 on 2027-01-01. Revisit this block on that date.
const GEMINI_3_FLASH_PRICING: PricingRate = {
  input: 0.75,
  output: 3.75,
  cached: 0.075,
  reasoning: 5.625,
  cache_creation: 0.75,
};

export const geminiPricing: Record<string, PricingRate> = {
  "gemini-3.7-flash": GEMINI_3_FLASH_PRICING,
  "gemini-3.6-flash": GEMINI_3_FLASH_PRICING,
  "gemini-3.1-pro": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-3-1-pro": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-3-pro-preview": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-3.1-pro-preview": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-2.5-pro": {
    input: 2.0,
    output: 12.0,
    cached: 0.25,
    reasoning: 18.0,
    cache_creation: 2.0,
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cached: 0.03,
    reasoning: 3.75,
    cache_creation: 0.3,
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cached: 0.025,
    reasoning: 0.6,
    cache_creation: 0.1,
  },
};
