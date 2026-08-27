/**
 * Z.ai and Alibaba Bailian Claude-format coding endpoints.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const ZAI_PROVIDERS: Record<string, RegistryEntry> = {
  "bailian-coding-plan": {
    id: "bailian-coding-plan",
    alias: "bcp",
    format: "claude",
    executor: "default",
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
    chatPath: "/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
    },
    models: [
      { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
      { id: "qwen3-max-2026-01-23", name: "Qwen3 Max (2026-01-23)" },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "glm-5", name: "GLM 5" },
      { id: "glm-4.7", name: "GLM 4.7" },
      { id: "kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
    ],
  },

  zai: {
    id: "zai",
    alias: "zai",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
    },
    models: [
      { id: "glm-5", name: "GLM 5" },
      { id: "glm-5-turbo", name: "GLM 5 Turbo" },
    ],
  },
};
