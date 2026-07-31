import { PricingRate } from "./base";

export const deepseekPricing: Record<string, PricingRate> = {
  "deepseek-chat": {
    input: 0.28,
    output: 0.42,
    cached: 0.014,
    reasoning: 0.42,
    cache_creation: 0.28,
  },
  "deepseek-v3": {
    input: 0.28,
    output: 0.42,
    cached: 0.014,
    reasoning: 0.42,
    cache_creation: 0.28,
  },
  "deepseek-v3.2": {
    input: 0.28,
    output: 0.42,
    cached: 0.014,
    reasoning: 0.42,
    cache_creation: 0.28,
  },
  "deepseek-reasoner": {
    input: 0.55,
    output: 2.19,
    cached: 0.14,
    reasoning: 2.19,
    cache_creation: 0.55,
  },
  "deepseek-r1": {
    input: 0.55,
    output: 2.19,
    cached: 0.14,
    reasoning: 2.19,
    cache_creation: 0.55,
  },
};

export const openrouterPricing: Record<string, PricingRate> = {
  auto: {
    input: 2.0,
    output: 8.0,
    cached: 1.0,
    reasoning: 12.0,
    cache_creation: 2.0,
  },
};
