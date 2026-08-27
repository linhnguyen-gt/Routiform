/**
 * Alibaba Cloud DashScope coding endpoints (alicode, alicode-intl).
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const ALIYUN_PROVIDERS: Record<string, RegistryEntry> = {
  alicode: {
    id: "alicode",
    alias: "alicode",
    format: "openai",
    executor: "default",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    quirks: { preserveCacheControl: true },
    models: [
      { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
      { id: "kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
      { id: "glm-5", name: "GLM 5" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "qwen3-max-2026-01-23", name: "Qwen3 Max" },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "glm-4.7", name: "GLM 4.7" },
    ],
  },

  "alicode-intl": {
    id: "alicode-intl",
    alias: "alicode-intl",
    format: "openai",
    executor: "default",
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    quirks: { preserveCacheControl: true },
    models: [
      { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
      { id: "kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
      { id: "glm-5", name: "GLM 5" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "qwen3-max-2026-01-23", name: "Qwen3 Max" },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "glm-4.7", name: "GLM 4.7" },
    ],
  },
};
