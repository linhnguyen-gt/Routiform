/**
 * MiniMax global and China endpoints.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const MINIMAX_PROVIDERS: Record<string, RegistryEntry> = {
  minimax: {
    id: "minimax",
    alias: "minimax",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.minimax.io/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
    },
    models: [
      // T12/T28: MiniMax default upgraded from M2.5 to M2.7
      { id: "minimax-m2.7", name: "MiniMax M2.7" },
      { id: "MiniMax-M2.7", name: "MiniMax M2.7 (Legacy Alias)" },
      { id: "minimax-m2.7-highspeed", name: "MiniMax M2.7 Highspeed" },
      { id: "minimax-m2.5", name: "MiniMax M2.5" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5 (Legacy Alias)" },
      { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
    ],
  },

  "minimax-cn": {
    id: "minimax-cn",
    alias: "minimax-cn", // unique alias (was colliding with minimax)
    format: "claude",
    executor: "default",
    baseUrl: "https://api.minimaxi.com/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
    },
    models: [
      // Keep parity with minimax to ensure model discovery works for minimax-cn connections.
      { id: "minimax-m2.7", name: "MiniMax M2.7" },
      { id: "MiniMax-M2.7", name: "MiniMax M2.7 (Legacy Alias)" },
      { id: "minimax-m2.7-highspeed", name: "MiniMax M2.7 Highspeed" },
      { id: "minimax-m2.5", name: "MiniMax M2.5" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5 (Legacy Alias)" },
      { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
    ],
  },
};
