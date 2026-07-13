/**
 * Free-tier provider registry entries.
 */

import { CONTEXT_CONFIG } from "../../src/shared/constants/context";
import type { RegistryEntry } from "./registry-types.ts";

export const FREE_PROVIDERS: Record<string, RegistryEntry> = {
  longcat: {
    id: "longcat",
    alias: "lc",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.longcat.chat/openai/v1/chat/completions",
    authType: "apikey",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // Free tier: 50M tokens/day (Flash-Lite) + 500K/day (Chat/Thinking) — 100% free while public beta
    models: [
      { id: "LongCat-Flash-Lite", name: "LongCat Flash-Lite (50M tok/day 🆓)" },
      { id: "LongCat-Flash-Chat", name: "LongCat Flash-Chat (500K tok/day 🆓)" },
      { id: "LongCat-Flash-Thinking", name: "LongCat Flash-Thinking (500K tok/day 🆓)" },
      { id: "LongCat-Flash-Thinking-2601", name: "LongCat Flash-Thinking-2601 (🆓)" },
      { id: "LongCat-Flash-Omni-2603", name: "LongCat Flash-Omni-2603 (🆓)" },
    ],
  },

  pollinations: {
    id: "pollinations",
    alias: "pol",
    format: "openai",
    executor: "pollinations",
    // No API key required for basic use. Proxy to GPT-5, Claude, Gemini, DeepSeek, Llama 4.
    baseUrl: "https://text.pollinations.ai/openai/chat/completions",
    authType: "apikey", // Optional — works without one too
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "openai", name: "GPT-5 via Pollinations (🆓)" },
      { id: "claude", name: "Claude via Pollinations (🆓)" },
      { id: "gemini", name: "Gemini via Pollinations (🆓)" },
      { id: "deepseek", name: "DeepSeek V3 via Pollinations (🆓)" },
      { id: "llama", name: "Llama 4 via Pollinations (🆓)" },
      { id: "mistral", name: "Mistral via Pollinations (🆓)" },
    ],
  },

  puter: {
    id: "puter",
    alias: "pu",
    format: "openai",
    executor: "puter",
    // OpenAI-compatible gateway with 500+ models (GPT, Claude, Gemini, Grok, DeepSeek, Qwen…)
    // Auth: Bearer <puter_auth_token> from puter.com/dashboard → Copy Auth Token
    // Model IDs use provider/model-name format for non-OpenAI models.
    // Only chat completions (incl. streaming) are available via REST.
    // Image gen, TTS, STT, video are puter.js SDK-only (browser).
    baseUrl: "https://api.puter.com/puterai/openai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      // OpenAI — use bare IDs
      { id: "gpt-4o-mini", name: "GPT-4o Mini (🆓 Puter)" },
      { id: "gpt-4o", name: "GPT-4o (Puter)" },
      { id: "gpt-4.1", name: "GPT-4.1 (Puter)" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini (Puter)" },
      { id: "gpt-5-nano", name: "GPT-5 Nano (Puter)" },
      { id: "gpt-5-mini", name: "GPT-5 Mini (Puter)" },
      { id: "gpt-5", name: "GPT-5 (Puter)" },
      { id: "o3-mini", name: "OpenAI o3-mini (Puter)" },
      { id: "o3", name: "OpenAI o3 (Puter)" },
      { id: "o4-mini", name: "OpenAI o4-mini (Puter)" },
      // Anthropic Claude — use bare IDs (confirmed working)
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (Puter)" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5 (Puter)" },
      { id: "claude-opus-4-5", name: "Claude Opus 4.5 (Puter)" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4 (Puter)" },
      { id: "claude-opus-4", name: "Claude Opus 4 (Puter)" },
      // Google Gemini — use google/ prefix (confirmed working)
      // google/gemini-2.0-flash removed: Google shut the 2.0 line down
      // 2026-06-01, so the model no longer exists behind this proxy either.
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (Puter)" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (Puter)" },
      { id: "google/gemini-3-flash", name: "Gemini 3 Flash (Puter)" },
      { id: "google/gemini-3-pro", name: "Gemini 3 Pro (Puter)" },
      // DeepSeek — use deepseek/ prefix (confirmed working)
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (Puter)" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Puter)" },
      { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2 (Puter)" },
      // xAI Grok — use x-ai/ prefix
      { id: "x-ai/grok-3", name: "Grok 3 (Puter)" },
      { id: "x-ai/grok-3-mini", name: "Grok 3 Mini (Puter)" },
      { id: "x-ai/grok-4", name: "Grok 4 (Puter)" },
      { id: "x-ai/grok-4-fast", name: "Grok 4 Fast (Puter)" },
      // Meta Llama — bare IDs (confirmed ✅)
      { id: "llama-4-scout", name: "Llama 4 Scout (Puter)" },
      { id: "llama-4-maverick", name: "Llama 4 Maverick (Puter)" },
      { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B (Puter)" },
      // Mistral — bare IDs (confirmed ✅)
      { id: "mistral-small-latest", name: "Mistral Small (Puter)" },
      { id: "mistral-medium-latest", name: "Mistral Medium (Puter)" },
      { id: "open-mistral-nemo", name: "Mistral Nemo (Puter)" },
      // Qwen — use qwen/ prefix (confirmed ✅)
      { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B (Puter)" },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B (Puter)" },
      { id: "qwen/qwen3-coder", name: "Qwen3 Coder 480B (Puter)" },
    ],
    passthroughModels: true, // 500+ models available — users can type arbitrary Puter model IDs
  },

  "cloudflare-ai": {
    id: "cloudflare-ai",
    alias: "cf",
    format: "openai",
    executor: "cloudflare-ai",
    // URL is dynamic: uses accountId from credentials. The executor builds it.
    baseUrl: "https://api.cloudflare.com/client/v4/accounts",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // 10K Neurons/day free: ~150 LLM responses or 500s Whisper audio — global edge
    models: [
      { id: "@cf/meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B (🆓 ~150 resp/day)" },
      { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B (🆓)" },
      { id: "@cf/google/gemma-3-12b-it", name: "Gemma 3 12B (🆓)" },
      { id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", name: "Mistral 7B (🆓)" },
      { id: "@cf/qwen/qwen2.5-coder-15b-instruct", name: "Qwen 2.5 Coder 15B (🆓)" },
      { id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", name: "DeepSeek R1 Distill 32B (🆓)" },
    ],
  },

  "xiaomi-mimo": {
    id: "xiaomi-mimo",
    alias: "mimo",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.xiaomimimo.com/v1",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "mimo-v2-pro", name: "MiMo-V2-Pro" },
      { id: "mimo-v2-omni", name: "MiMo-V2-Omni" },
      { id: "mimo-v2-tts", name: "MiMo-V2-TTS" },
    ],
  },

  "xiaomi-mimo-token-plan": {
    id: "xiaomi-mimo-token-plan",
    alias: "mimotp",
    format: "openai",
    executor: "default",
    baseUrl: "https://token-plan-cn.xiaomimimo.com",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "mimo-v2-pro", name: "MiMo-V2-Pro" },
      { id: "mimo-v2-omni", name: "MiMo-V2-Omni" },
      { id: "mimo-v2-tts", name: "MiMo-V2-TTS" },
    ],
  },

  scaleway: {
    id: "scaleway",
    alias: "scw",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.scaleway.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // 1M tokens free for new accounts — EU/GDPR (Paris), no credit card needed under limit
    models: [
      { id: "qwen3-235b-a22b-instruct-2507", name: "Qwen3 235B A22B (1M free tok 🆓)" },
      { id: "llama-3.1-70b-instruct", name: "Llama 3.1 70B (🆓 EU)" },
      { id: "llama-3.1-8b-instruct", name: "Llama 3.1 8B (🆓 EU)" },
      { id: "mistral-small-3.2-24b-instruct-2506", name: "Mistral Small 3.2 (🆓 EU)" },
      { id: "deepseek-v3-0324", name: "DeepSeek V3 (🆓 EU)" },
      { id: "gpt-oss-120b", name: "GPT-OSS 120B (🆓 EU)" },
    ],
  },

  aimlapi: {
    id: "aimlapi",
    alias: "aiml",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.aimlapi.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    // $0.025/day free credits — 200+ models via single aggregator endpoint
    models: [
      { id: "gpt-4o", name: "GPT-4o (via AI/ML API)" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (via AI/ML API)" },
      // gemini-1.5-pro is retired and absent from the live AI/ML API catalog,
      // which also namespaces Google models under a google/ prefix.
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via AI/ML API)" },
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", name: "Llama 3.1 70B (via AI/ML API)" },
      { id: "deepseek-chat", name: "DeepSeek Chat (via AI/ML API)" },
      { id: "mistral-large-latest", name: "Mistral Large (via AI/ML API)" },
    ],
    passthroughModels: true,
  },
};
