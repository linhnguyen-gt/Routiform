/**
 * Additional OpenAI-format API-key providers.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const OPENAI_FORMAT_PROVIDERS: Record<string, RegistryEntry> = {
  deepseek: {
    id: "deepseek",
    alias: "ds",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2 Chat" },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek V3.2 Reasoner",
        defaultParams: { reasoning: { effort: "medium" } },
      },
    ],
  },

  deepinfra: {
    id: "deepinfra",
    alias: "di",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.deepinfra.com/v1/openai/chat/completions",
    modelsUrl: "https://api.deepinfra.com/v1/openai/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "meta-llama/Meta-Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct" },
      { id: "Qwen/Qwen3-32B", name: "Qwen3 32B" },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
    ],
  },

  sambanova: {
    id: "sambanova",
    alias: "sn",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.sambanova.ai/v1/chat/completions",
    modelsUrl: "https://api.sambanova.ai/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "Meta-Llama-3.1-8B-Instruct", name: "Meta Llama 3.1 8B Instruct" },
      { id: "Meta-Llama-3.3-70B-Instruct", name: "Meta Llama 3.3 70B Instruct" },
      { id: "Qwen3-32B", name: "Qwen3 32B" },
    ],
  },

  venice: {
    id: "venice",
    alias: "ven",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.venice.ai/api/v1/chat/completions",
    modelsUrl: "https://api.venice.ai/api/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "venice-uncensored", name: "Venice Uncensored" },
      { id: "mistral-31-24b", name: "Mistral 31 24B" },
      { id: "zai-org-glm-4.7", name: "GLM 4.7" },
    ],
  },

  groq: {
    id: "groq",
    alias: "groq",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    ],
  },

  blackbox: {
    id: "blackbox",
    alias: "bb",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.blackbox.ai/v1/chat/completions",
    modelsUrl: "https://api.blackbox.ai/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "deepseek-v3", name: "DeepSeek V3" },
      { id: "blackboxai", name: "Blackbox AI" },
      { id: "blackboxai-pro", name: "Blackbox AI Pro" },
    ],
  },

  xai: {
    id: "xai",
    alias: "xai",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    oauth: {
      clientIdEnv: "XAI_OAUTH_CLIENT_ID",
      clientIdDefault: "b1a00492-073a-47ea-816f-4c329264a828",
      tokenUrl: "https://auth.x.ai/oauth2/token",
    },
    models: [
      { id: "grok-4-fast-non-reasoning", name: "Grok 4 Fast" },
      { id: "grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning" },
      { id: "grok-4-1-fast-non-reasoning", name: "Grok 4.1 Fast" },
      { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 Fast Reasoning" },
      { id: "grok-4-0709", name: "Grok 4 (0709)" },
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
  },

  mistral: {
    id: "mistral",
    alias: "mistral",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "mistral-large-latest", name: "Mistral Large 3" },
      { id: "codestral-latest", name: "Codestral" },
      { id: "mistral-medium-latest", name: "Mistral Medium 3" },
    ],
  },

  perplexity: {
    id: "perplexity",
    alias: "pplx",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.perplexity.ai/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "sonar-pro", name: "Sonar Pro" },
      { id: "sonar", name: "Sonar" },
    ],
  },

  together: {
    id: "together",
    alias: "together",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.together.xyz/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", name: "Llama 3.3 70B Turbo (🆓 Free)" },
      { id: "meta-llama/Llama-Vision-Free", name: "Llama Vision (🆓 Free)" },
      {
        id: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free",
        name: "DeepSeek R1 Distill 70B (🆓 Free)",
      },
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo" },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
      { id: "Qwen/Qwen3-235B-A22B", name: "Qwen3 235B" },
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", name: "Llama 4 Maverick" },
    ],
  },

  fireworks: {
    id: "fireworks",
    alias: "fireworks",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "accounts/fireworks/models/deepseek-v3p1", name: "DeepSeek V3.1" },
      { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B" },
      { id: "accounts/fireworks/models/qwen3-235b-a22b", name: "Qwen3 235B" },
    ],
  },

  cerebras: {
    id: "cerebras",
    alias: "cerebras",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "gpt-oss-120b", name: "GPT OSS 120B" },
      { id: "zai-glm-4.7", name: "ZAI GLM 4.7" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B" },
      { id: "llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
      { id: "qwen-3-235b-a22b-instruct-2507", name: "Qwen3 235B A22B" },
      { id: "qwen-3-32b", name: "Qwen3 32B" },
    ],
  },
};
