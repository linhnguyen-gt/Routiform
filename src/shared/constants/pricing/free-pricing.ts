import { PricingRate } from "./base";

export const groqPricing: Record<string, PricingRate> = {
  "openai/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "llama-3.3-70b-versatile": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "meta-llama/llama-4-maverick-17b-128e-instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "qwen/qwen3-32b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
};

export const blackboxPricing: Record<string, PricingRate> = {
  "gpt-4o": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gemini-2.5-flash": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "claude-sonnet-4": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "deepseek-v3": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  blackboxai: { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "blackboxai-pro": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
};

export const fireworksPricing: Record<string, PricingRate> = {
  "accounts/fireworks/models/gpt-oss-120b": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "accounts/fireworks/models/deepseek-v3p1": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "accounts/fireworks/models/llama-v3p3-70b-instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "accounts/fireworks/models/qwen3-235b-a22b": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
};

export const cerebrasPricing: Record<string, PricingRate> = {
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "zai-glm-4.7": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "llama-3.3-70b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "llama-4-scout-17b-16e-instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "qwen-3-235b-a22b-instruct-2507": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "qwen-3-32b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
};

export const nvidiaPricing: Record<string, PricingRate> = {
  "nvidia/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "openai/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "moonshotai/kimi-k2.5": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "z-ai/glm4.7": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "deepseek-ai/deepseek-v3.2": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "nvidia/llama-3.3-70b-instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "meta/llama-4-maverick-17b-128e-instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "deepseek/deepseek-r1": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
};

export const nebiusPricing: Record<string, PricingRate> = {
  "openai/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "meta-llama/Llama-3.3-70B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
};

export const hyperbolicPricing: Record<string, PricingRate> = {
  "openai/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "Qwen/QwQ-32B": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "deepseek-ai/DeepSeek-R1": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "deepseek-ai/DeepSeek-V3": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "meta-llama/Llama-3.3-70B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "meta-llama/Llama-3.2-3B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "Qwen/Qwen2.5-72B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "Qwen/Qwen2.5-Coder-32B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "NousResearch/Hermes-3-Llama-3.1-70B": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
};

export const siliconflowPricing: Record<string, PricingRate> = {
  "openai/gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "gpt-oss-120b": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "deepseek-ai/DeepSeek-V3.2": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "deepseek-ai/DeepSeek-V3.1": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "deepseek-ai/DeepSeek-R1": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "Qwen/Qwen3-235B-A22B-Instruct-2507": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "Qwen/Qwen3-Coder-480B-A35B-Instruct": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
  "Qwen/Qwen3-32B": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "moonshotai/Kimi-K2.5": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "zai-org/GLM-4.7": { input: 0, output: 0, cached: 0, reasoning: 0, cache_creation: 0 },
  "baidu/ERNIE-4.5-300B-A47B": {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    cache_creation: 0,
  },
};
