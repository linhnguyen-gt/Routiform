import { PricingRate } from "./base";

export const minimaxPricing: Record<string, PricingRate> = {
  "minimax-m2.1": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "MiniMax-M2.1": {
    input: 0.5,
    output: 2.0,
    cached: 0.25,
    reasoning: 3.0,
    cache_creation: 0.5,
  },
  "minimax-m2.5": {
    input: 0.27,
    output: 0.95,
    cached: 0.135,
    reasoning: 1.425,
    cache_creation: 0.27,
  },
  "MiniMax-M2.5": {
    input: 0.27,
    output: 0.95,
    cached: 0.135,
    reasoning: 1.425,
    cache_creation: 0.27,
  },
  "minimax-m2.7": {
    input: 0.4,
    output: 1.6,
    cached: 0.2,
    reasoning: 2.4,
    cache_creation: 0.4,
  },
  "MiniMax-M2.7": {
    input: 0.4,
    output: 1.6,
    cached: 0.2,
    reasoning: 2.4,
    cache_creation: 0.4,
  },
  "minimax-m2.7-highspeed": {
    input: 0.4,
    output: 1.6,
    cached: 0.2,
    reasoning: 2.4,
    cache_creation: 0.4,
  },
};
