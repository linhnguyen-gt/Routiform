export interface PricingRate {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  cache_creation: number;
}

export const GPT_5_3_CODEX_PRICING: PricingRate = {
  input: 1.75,
  output: 14.0,
  cached: 0.175,
  reasoning: 21.0,
  cache_creation: 1.75,
};

export const GPT_5_4_PRICING: PricingRate = {
  input: 2.5,
  output: 15.0,
  cached: 0.25,
  reasoning: 22.5,
  cache_creation: 2.5,
};

export const GPT_5_4_MINI_PRICING: PricingRate = {
  input: 0.75,
  output: 4.5,
  cached: 0.075,
  reasoning: 6.75,
  cache_creation: 0.75,
};

export const CLAUDE_OPUS_4_PRICING: PricingRate = {
  input: 15.0,
  output: 75.0,
  cached: 7.5,
  reasoning: 112.5,
  cache_creation: 15.0,
};

export const CLAUDE_SONNET_4_PRICING: PricingRate = {
  input: 3.0,
  output: 15.0,
  cached: 1.5,
  reasoning: 15.0,
  cache_creation: 3.0,
};

export const CLAUDE_OPUS_46_PRICING: PricingRate = {
  input: 5.0,
  output: 25.0,
  cached: 2.5,
  reasoning: 37.5,
  cache_creation: 5.0,
};

export const CLAUDE_SONNET_46_PRICING: PricingRate = {
  input: 3.0,
  output: 15.0,
  cached: 1.5,
  reasoning: 22.5,
  cache_creation: 3.0,
};

export const CLAUDE_FABLE_5_PRICING: PricingRate = {
  input: 10.0,
  output: 50.0,
  cached: 1.0,
  reasoning: 75.0,
  cache_creation: 12.5,
};
