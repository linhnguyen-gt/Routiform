import { PricingRate } from "./base";

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

export const geminiPricing: Record<string, PricingRate> = {
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
