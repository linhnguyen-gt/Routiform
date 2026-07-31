import { PricingRate } from "./base";

export const qwPricing: Record<string, PricingRate> = {
  "qwen3-coder-plus": {
    input: 1.0,
    output: 4.0,
    cached: 0.5,
    reasoning: 6.0,
    cache_creation: 1.0,
  },
  "qwen3-coder-next": {
    input: 2.0,
    output: 8.0,
    cached: 1.0,
    reasoning: 12.0,
    cache_creation: 2.0,
  },
  "qwen3-coder-flash": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "vision-model": {
    input: 1.5,
    output: 6.0,
    cached: 0.75,
    reasoning: 9.0,
    cache_creation: 1.5,
  },
};

export const ifPricing: Record<string, PricingRate> = {
  "qwen3-coder-plus": {
    input: 1.0,
    output: 4.0,
    cached: 0.5,
    reasoning: 6.0,
    cache_creation: 1.0,
  },
  "kimi-k2": {
    input: 1.0,
    output: 4.0,
    cached: 0.5,
    reasoning: 6.0,
    cache_creation: 1.0,
  },
  "kimi-k2-thinking": {
    input: 1.5,
    output: 6.0,
    cached: 0.75,
    reasoning: 9.0,
    cache_creation: 1.5,
  },
  "deepseek-r1": {
    input: 0.75,
    output: 3.0,
    cached: 0.375,
    reasoning: 4.5,
    cache_creation: 0.75,
  },
  "deepseek-v3.2-chat": {
    input: 0.28,
    output: 0.42,
    cached: 0.014,
    reasoning: 0.63,
    cache_creation: 0.28,
  },
  "deepseek-v3.2": {
    input: 0.28,
    output: 0.42,
    cached: 0.014,
    reasoning: 0.63,
    cache_creation: 0.28,
  },
  "deepseek-v3.2-reasoner": {
    input: 0.55,
    output: 2.19,
    cached: 0.14,
    reasoning: 2.19,
    cache_creation: 0.55,
  },
  "deepseek-3.1": {
    input: 0.27,
    output: 1.1,
    cached: 0.07,
    reasoning: 2.2,
    cache_creation: 0.27,
  },
  "deepseek-3.2": {
    input: 0.27,
    output: 1.1,
    cached: 0.07,
    reasoning: 2.2,
    cache_creation: 0.27,
  },
  "minimax-m2": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "glm-4.6": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "glm-4.7": {
    input: 0.75,
    output: 3.0,
    cached: 0.375,
    reasoning: 4.5,
    cache_creation: 0.75,
  },
};
