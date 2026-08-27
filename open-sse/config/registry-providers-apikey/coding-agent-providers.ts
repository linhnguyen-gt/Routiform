/**
 * Coding-agent marketplace providers (KiloCode, Cline).
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const CODING_AGENT_PROVIDERS: Record<string, RegistryEntry> = {
  kilocode: {
    id: "kilocode",
    alias: "kc",
    format: "openrouter",
    executor: "default",
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    modelsUrl: "https://api.kilo.ai/api/openrouter/models",
    authType: "oauth",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    oauth: {
      initiateUrl: "https://api.kilo.ai/api/device-auth/codes",
      pollUrlBase: "https://api.kilo.ai/api/device-auth/codes",
    },
    models: [
      { id: "openrouter/free", name: "Free Models Router" },
      { id: "qwen/qwen3-vl-235b-a22b-thinking", name: "Qwen3 VL 235B A22B Thinking" },
      { id: "qwen/qwen3-235b-a22b-thinking-2507", name: "Qwen3 235B A22B Thinking 2507" },
      { id: "qwen/qwen3-vl-30b-a3b-thinking", name: "Qwen3 VL 30B A3B Thinking" },
      { id: "stepfun/step-3.5-flash:free", name: "StepFun Step 3.5 Flash" },
      { id: "arcee-ai/trinity-large-preview:free", name: "Arcee AI Trinity Large Preview" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "openai/gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "openai/gpt-5-nano", name: "GPT-5 Nano" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
      // google/gemini-2.0-flash removed: shut down by Google 2026-06-01 and no
      // longer present in the upstream OpenRouter catalog this provider proxies.
      { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1" },
      { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
      { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
      { id: "qwen/qwen3-8b", name: "Qwen3 8B" },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
      { id: "qwen/qwen3-coder", name: "Qwen3 Coder 480B" },
      { id: "qwen/qwq-32b", name: "QwQ 32B" },
      { id: "mistralai/mistral-small-24b-instruct-2501", name: "Mistral Small 3" },
      { id: "mistralai/mistral-7b-instruct", name: "Mistral 7B" },
      { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1" },
      { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
    ],
    passthroughModels: true,
  },

  cline: {
    id: "cline",
    alias: "cl",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cline.bot/api/v1/chat/completions",
    authType: "oauth",
    authHeader: "Authorization",
    authPrefix: "Bearer workos:",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    oauth: {
      tokenUrl: "https://api.cline.bot/api/v1/auth/token",
      refreshUrl: "https://api.cline.bot/api/v1/auth/refresh",
      authUrl: "https://api.cline.bot/api/v1/auth/authorize",
    },
    extraHeaders: {
      "HTTP-Referer": "https://cline.bot",
      "X-Title": "Cline",
    },
    models: [
      { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "anthropic/claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "openai/gpt-4.1", name: "GPT-4.1" },
      { id: "openai/o3", name: "o3" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
    ],
    passthroughModels: true,
  },
};
