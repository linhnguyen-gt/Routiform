import { PricingRate } from "./base";

export const kimiPricing: Record<string, PricingRate> = {
  "kimi-latest": {
    input: 1.0,
    output: 4.0,
    cached: 0.5,
    reasoning: 6.0,
    cache_creation: 1.0,
  },
  "kimi-k2.5": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
  "kimi-k2.5-thinking": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
  "kimi-for-coding": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
  "moonshot-kimi-k2.5": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
};

export const kmcPricing: Record<string, PricingRate> = {
  "kimi-k2.5": { input: 0.6, output: 3.0, cached: 0.3, reasoning: 4.5, cache_creation: 0.6 },
  "kimi-k2.5-thinking": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
  "kimi-latest": { input: 1.0, output: 4.0, cached: 0.5, reasoning: 6.0, cache_creation: 1.0 },
};

export const kmcaPricing: Record<string, PricingRate> = {
  "kimi-k2.5": { input: 0.6, output: 3.0, cached: 0.3, reasoning: 4.5, cache_creation: 0.6 },
  "kimi-k2.5-thinking": {
    input: 0.6,
    output: 3.0,
    cached: 0.3,
    reasoning: 4.5,
    cache_creation: 0.6,
  },
  "kimi-latest": { input: 1.0, output: 4.0, cached: 0.5, reasoning: 6.0, cache_creation: 1.0 },
};
