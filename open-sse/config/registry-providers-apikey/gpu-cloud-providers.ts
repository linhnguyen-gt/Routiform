/**
 * GPU-cloud and open-model hosting platforms.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const GPU_CLOUD_PROVIDERS: Record<string, RegistryEntry> = {
  "ollama-cloud": {
    id: "ollama-cloud",
    alias: "ollamacloud",
    format: "openai",
    executor: "default",
    baseUrl: "https://ollama.com/v1/chat/completions",
    modelsUrl: "https://ollama.com/api/tags",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // Note: rate limits vary by plan (free = "Light usage", Pro = more, Max = 5x Pro).
    // Users can generate API keys at https://ollama.com/settings/api-keys
    models: [
      { id: "gemma3:27b", name: "Gemma 3 27B" },
      { id: "llama3.3:70b", name: "Llama 3.3 70B" },
      { id: "qwen3:72b", name: "Qwen3 72B" },
      { id: "devstral:24b", name: "Devstral 24B" },
      { id: "deepseek-r2:671b", name: "DeepSeek R2 671B" },
      { id: "phi4:14b", name: "Phi 4 14B" },
      { id: "mistral-small3.2:24b", name: "Mistral Small 3.2 24B" },
    ],
    passthroughModels: true,
  },

  cohere: {
    id: "cohere",
    alias: "cohere",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cohere.com/v2/chat",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "command-r-plus-08-2024", name: "Command R+ (Aug 2024)" },
      { id: "command-r-08-2024", name: "Command R (Aug 2024)" },
      { id: "command-a-03-2025", name: "Command A (Mar 2025)" },
    ],
  },

  nvidia: {
    id: "nvidia",
    alias: "nvidia",
    format: "openai",
    executor: "default",
    baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // Only ids NVIDIA still lists at /v1/models belong here. This list is hand-maintained
    // while the upstream catalog moves under it, and every id that outlives its model is a
    // model the picker offers and the provider answers 410 Gone for. Model sync reports the
    // drift on every run (see the sync route's retiredRegistryModels) — when it names an id
    // below, delete it; sync will pick the model back up on its own if NVIDIA restores it.
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B (OpenAI Prefix)", toolCalling: false },
      { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
      { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", forceParams: { temperature: 1 } },
      {
        id: "z-ai/glm-5.2",
        name: "GLM 5.2",
        // NVIDIA NIM is OpenAI-compatible and rejects the native `thinking` field
        // GLM emits for reasoning; strip it and rely on `reasoning_effort` instead.
        unsupportedParams: ["thinking"],
        contextLength: 200000,
        maxOutputTokens: 128000,
      },
      {
        // NVIDIA versions this id upstream; the unsuffixed form is not served.
        id: "deepseek-ai/deepseek-v4-flash-0731",
        name: "DeepSeek V4 Flash",
        unsupportedParams: ["thinking"],
        contextLength: 1000000,
        maxOutputTokens: 65536,
      },
      {
        id: "minimaxai/minimax-m3",
        name: "MiniMax M3",
        // Same NIM `thinking`-field rejection as GLM/DeepSeek above.
        unsupportedParams: ["thinking"],
        contextLength: 512000,
        maxOutputTokens: 131072,
      },
    ],
  },

  nebius: {
    id: "nebius",
    alias: "nebius",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.tokenfactory.nebius.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [{ id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct" }],
  },

  siliconflow: {
    id: "siliconflow",
    alias: "siliconflow",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.siliconflow.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "deepseek-ai/DeepSeek-V3.2", name: "DeepSeek V3.2" },
      { id: "deepseek-ai/DeepSeek-V3.1", name: "DeepSeek V3.1" },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
      { id: "Qwen/Qwen3-235B-A22B-Instruct-2507", name: "Qwen3 235B" },
      { id: "Qwen/Qwen3-Coder-480B-A35B-Instruct", name: "Qwen3 Coder 480B" },
      { id: "Qwen/Qwen3-32B", name: "Qwen3 32B" },
      { id: "moonshotai/Kimi-K2.5", name: "Kimi K2.5" },
      { id: "zai-org/GLM-4.7", name: "GLM 4.7" },
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" },
      { id: "baidu/ERNIE-4.5-300B-A47B", name: "ERNIE 4.5 300B" },
    ],
  },

  hyperbolic: {
    id: "hyperbolic",
    alias: "hyp",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.hyperbolic.xyz/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "Qwen/QwQ-32B", name: "QwQ 32B" },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
      { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B" },
      { id: "meta-llama/Llama-3.2-3B-Instruct", name: "Llama 3.2 3B" },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B" },
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "Qwen 2.5 Coder 32B" },
      { id: "NousResearch/Hermes-3-Llama-3.1-70B", name: "Hermes 3 70B" },
    ],
  },

  huggingface: {
    id: "huggingface",
    alias: "hf",
    format: "openai",
    executor: "default",
    // HuggingFace Inference API — OpenAI-compatible endpoint
    // Users must set their provider-specific baseUrl (model endpoint) in providerSpecificData.baseUrl
    // or use a fixed model like: https://router.huggingface.co/ngc/nvidia/llama-3_1-nemotron-51b-instruct
    baseUrl:
      "https://router.huggingface.co/hf-inference/models/meta-llama/Meta-Llama-3.1-70B-Instruct/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B Instruct" },
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct" },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B" },
      { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral 7B v0.3" },
      { id: "microsoft/Phi-3.5-mini-instruct", name: "Phi-3.5 Mini" },
    ],
  },

  synthetic: {
    id: "synthetic",
    alias: "synthetic",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.synthetic.new/openai/v1/chat/completions",
    modelsUrl: "https://api.synthetic.new/openai/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "hf:nvidia/Kimi-K2.5-NVFP4", name: "Kimi K2.5 (NVFP4)" },
      { id: "hf:MiniMaxAI/MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "hf:zai-org/GLM-4.7-Flash", name: "GLM 4.7 Flash" },
      { id: "hf:zai-org/GLM-4.7", name: "GLM 4.7" },
      { id: "hf:moonshotai/Kimi-K2.5", name: "Kimi K2.5" },
      { id: "hf:deepseek-ai/DeepSeek-V3.2", name: "DeepSeek V3.2" },
    ],
    passthroughModels: true,
  },
};
