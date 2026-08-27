/**
 * Moonshot Kimi providers (API key, OAuth coding, API-key coding).
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import { KIMI_CODING_SHARED } from "../registry-internal.ts";
import type { RegistryEntry } from "../registry-types.ts";

export const KIMI_PROVIDERS: Record<string, RegistryEntry> = {
  kimi: {
    id: "kimi",
    alias: "kimi",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.moonshot.ai/v1/chat/completions",
    modelsUrl: "https://api.moonshot.ai/v1/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5", forceParams: { temperature: 1 } },
      { id: "kimi-k2.5-thinking", name: "Kimi K2.5 Thinking", forceParams: { temperature: 1 } },
      { id: "kimi-latest", name: "Kimi Latest" },
      { id: "kimi-for-coding", name: "Kimi For Coding" },
    ],
  },

  "kimi-coding": {
    id: "kimi-coding",
    alias: "kmc",
    ...KIMI_CODING_SHARED,
    urlSuffix: "?beta=true",
    modelsUrl: "https://api.kimi.com/coding/v1/models",
    authType: "oauth",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    oauth: {
      clientIdEnv: "KIMI_CODING_OAUTH_CLIENT_ID",
      clientIdDefault: "17e5f671-d194-4dfb-9706-5516cb48c098",
      tokenUrl: "https://auth.kimi.com/api/oauth/token",
      refreshUrl: "https://auth.kimi.com/api/oauth/token",
      authUrl: "https://auth.kimi.com/api/oauth/device_authorization",
    },
  },

  "kimi-coding-apikey": {
    id: "kimi-coding-apikey",
    alias: "kmca",
    ...KIMI_CODING_SHARED,
    modelsUrl: "https://api.kimi.com/coding/v1/models",
    authType: "apikey",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
  },
};
