/**
 * First-party frontier providers: OpenAI and Anthropic.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";
import { REASONING_UNSUPPORTED } from "../registry-types.ts";

export const FRONTIER_PROVIDERS: Record<string, RegistryEntry> = {
  openai: {
    id: "openai",
    alias: "openai",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: 128000,
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      {
        id: "o1",
        name: "O1",
        unsupportedParams: REASONING_UNSUPPORTED,
        defaultParams: { reasoning: { effort: "medium" } },
      },
      {
        id: "o1-mini",
        name: "O1 Mini",
        unsupportedParams: REASONING_UNSUPPORTED,
        defaultParams: { reasoning: { effort: "medium" } },
      },
      {
        id: "o1-pro",
        name: "O1 Pro",
        unsupportedParams: REASONING_UNSUPPORTED,
        defaultParams: { reasoning: { effort: "high" } },
      },
      {
        id: "o3",
        name: "O3",
        unsupportedParams: REASONING_UNSUPPORTED,
        defaultParams: { reasoning: { effort: "high" } },
      },
      {
        id: "o3-mini",
        name: "O3 Mini",
        unsupportedParams: REASONING_UNSUPPORTED,
        defaultParams: { reasoning: { effort: "medium" } },
      },
    ],
  },

  anthropic: {
    id: "anthropic",
    alias: "anthropic",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.anthropic.com/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
    },
    models: [
      { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    ],
  },
};
