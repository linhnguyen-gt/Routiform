import { PricingRate } from "./base";

export const xaiPricing: Record<string, PricingRate> = {
  "grok-3": {
    input: 3.0,
    output: 15.0,
    cached: 1.5,
    reasoning: 22.5,
    cache_creation: 3.0,
  },
  "grok-3-mini": {
    input: 0.3,
    output: 0.5,
    cached: 0.15,
    reasoning: 0.75,
    cache_creation: 0.3,
  },
  "grok-4-fast-non-reasoning": {
    input: 0.2,
    output: 0.5,
    cached: 0.1,
    reasoning: 0.0,
    cache_creation: 0.2,
  },
  "grok-4-fast-reasoning": {
    input: 0.2,
    output: 0.5,
    cached: 0.1,
    reasoning: 0.75,
    cache_creation: 0.2,
  },
  "grok-4-1-fast-non-reasoning": {
    input: 0.2,
    output: 0.5,
    cached: 0.1,
    reasoning: 0.0,
    cache_creation: 0.2,
  },
  "grok-4-1-fast-reasoning": {
    input: 0.2,
    output: 0.5,
    cached: 0.1,
    reasoning: 0.75,
    cache_creation: 0.2,
  },
  "grok-4-0709": {
    input: 0.2,
    output: 1.5,
    cached: 0.1,
    reasoning: 2.25,
    cache_creation: 0.2,
  },
};

export const zaiPricing: Record<string, PricingRate> = {
  "glm-5": {
    input: 0.38,
    output: 1.98,
    cached: 0.19,
    reasoning: 2.97,
    cache_creation: 0.38,
  },
  "glm-5-turbo": {
    input: 1.2,
    output: 4.0,
    cached: 0.6,
    reasoning: 6.0,
    cache_creation: 1.2,
  },
  "glm-4.7": {
    input: 0.38,
    output: 1.98,
    cached: 0.19,
    reasoning: 2.97,
    cache_creation: 0.38,
  },
};

export const kiroPricing: Record<string, PricingRate> = {
  "claude-sonnet-4.5": {
    input: 3.0,
    output: 15.0,
    cached: 1.5,
    reasoning: 15.0,
    cache_creation: 3.0,
  },
  "claude-haiku-4.5": {
    input: 0.5,
    output: 2.5,
    cached: 0.25,
    reasoning: 2.5,
    cache_creation: 0.5,
  },
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cached: 1.5,
    reasoning: 15.0,
    cache_creation: 3.0,
  },
  "claude-opus-4.6": {
    input: 15.0,
    output: 75.0,
    cached: 7.5,
    reasoning: 75.0,
    cache_creation: 15.0,
  },
  "deepseek-v3.2": {
    input: 0.27,
    output: 1.1,
    cached: 0.07,
    reasoning: 1.1,
    cache_creation: 0.27,
  },
  "minimax-m2.1": {
    input: 0.4,
    output: 1.6,
    cached: 0.1,
    reasoning: 1.6,
    cache_creation: 0.4,
  },
  "qwen3-coder-next": {
    input: 2.0,
    output: 8.0,
    cached: 0.5,
    reasoning: 8.0,
    cache_creation: 2.0,
  },
  auto: {
    input: 3.0,
    output: 15.0,
    cached: 1.5,
    reasoning: 15.0,
    cache_creation: 3.0,
  },
};
