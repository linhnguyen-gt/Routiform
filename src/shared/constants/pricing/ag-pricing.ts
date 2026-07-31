import { PricingRate } from "./base";

export const agPricing: Record<string, PricingRate> = {
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
