/**
 * Multi-model router and gateway providers (OpenCode, OpenRouter, CommandCode).
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const ROUTER_PROVIDERS: Record<string, RegistryEntry> = {
  "opencode-go": {
    id: "opencode-go",
    alias: "opencode-go",
    format: "openai",
    executor: "opencode-go",
    /** Go tier: only models listed at https://opencode.ai/docs/go/ — do not use Zen catalog. */
    baseUrl: "https://opencode.ai/zen/go/v1",
    authType: "apikey",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "glm-5", name: "GLM-5" },
      { id: "kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
      { id: "mimo-v2-pro", name: "MiMo-V2-Pro" },
      { id: "mimo-v2-omni", name: "MiMo-V2-Omni" },
      { id: "minimax-m2.7", name: "MiniMax M2.7", targetFormat: "claude" },
      { id: "minimax-m2.5", name: "MiniMax M2.5", targetFormat: "claude" },
    ],
  },

  "opencode-zen": {
    id: "opencode-zen",
    alias: "opencode-zen",
    format: "openai",
    executor: "opencode-zen",
    baseUrl: "https://opencode.ai/zen/v1",
    modelsUrl: "https://opencode.ai/zen/v1/models",
    authType: "apikey",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "minimax-m2.5-free", name: "MiniMax M2.5 Free", contextLength: 204800 },
      { id: "big-pickle", name: "Big Pickle", contextLength: CONTEXT_CONFIG.defaultLimit },
      { id: "gpt-5-nano", name: "GPT 5 Nano", contextLength: 400000 },
      { id: "mimo-v2-omni-free", name: "MiMo V2 Omni Free", contextLength: 262144 },
      { id: "mimo-v2-pro-free", name: "MiMo V2 Pro Free", contextLength: 1048576 },
      { id: "nemotron-3-super-free", name: "Nemotron 3 Super Free", contextLength: 1000000 },
      { id: "qwen3.6-plus-free", name: "Qwen 3.6 Plus Free", contextLength: 1048576 },
    ],
  },

  openrouter: {
    id: "openrouter",
    alias: "openrouter",
    format: "openai",
    executor: "default",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: 128000,
    headers: {},
    // Empty: any model ID is valid; UI lists aliases + OpenRouter catalog (same pattern as 9router providerModels.openrouter: []).
    models: [],
  },

  commandcode: {
    id: "commandcode",
    alias: "cc2",
    format: "commandcode",
    executor: "commandcode",
    baseUrl: "https://api.commandcode.ai/alpha/generate",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: 131072,
    headers: {
      "x-command-code-version": "0.25.7",
      "x-cli-environment": "cli",
    },
    models: [
      { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "moonshotai/Kimi-K2.6", name: "Kimi K2.6" },
      { id: "moonshotai/Kimi-K2.5", name: "Kimi K2.5" },
      { id: "zai-org/GLM-5.1", name: "GLM 5.1" },
      { id: "zai-org/GLM-5", name: "GLM 5" },
      { id: "MiniMaxAI/MiniMax-M2.7", name: "MiniMax M2.7" },
      { id: "MiniMaxAI/MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "Qwen/Qwen3.6-Max-Preview", name: "Qwen 3.6 Max Preview" },
      { id: "Qwen/Qwen3.6-Plus", name: "Qwen 3.6 Plus" },
      { id: "stepfun/Step-3.5-Flash", name: "Step 3.5 Flash" },
    ],
  },
};
