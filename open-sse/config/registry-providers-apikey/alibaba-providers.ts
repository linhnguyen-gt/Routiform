/**
 * Alibaba DashScope international provider.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const ALIBABA_PROVIDERS: Record<string, RegistryEntry> = {
  alibaba: {
    id: "alibaba",
    alias: "ali",
    format: "openai",
    executor: "default",
    // DashScope international OpenAI-compatible endpoint.
    // China users should set providerSpecificData.baseUrl to:
    //   https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelsUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "qwen-max", name: "Qwen Max" },
      { id: "qwen-max-2025-01-25", name: "Qwen Max (2025-01-25)" },
      { id: "qwen-plus", name: "Qwen Plus" },
      { id: "qwen-plus-2025-07-14", name: "Qwen Plus (2025-07-14)" },
      { id: "qwen-turbo", name: "Qwen Turbo" },
      { id: "qwen-turbo-2025-11-01", name: "Qwen Turbo (2025-11-01)" },
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "qwen3-coder-flash", name: "Qwen3 Coder Flash" },
      { id: "qwq-plus", name: "QwQ Plus (Reasoning)" },
      { id: "qwq-32b", name: "QwQ 32B" },
      { id: "qwen3-32b", name: "Qwen3 32B" },
      { id: "qwen3-235b-a22b", name: "Qwen3 235B A22B" },
    ],
    passthroughModels: true,
  },
};
