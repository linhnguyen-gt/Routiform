/**
 * Kilo gateway provider.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const KILO_GATEWAY_PROVIDERS: Record<string, RegistryEntry> = {
  "kilo-gateway": {
    id: "kilo-gateway",
    alias: "kg",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.kilo.ai/api/gateway/chat/completions",
    modelsUrl: "https://api.kilo.ai/api/gateway/models",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "kilo-auto/frontier", name: "Kilo Auto Frontier" },
      { id: "kilo-auto/balanced", name: "Kilo Auto Balanced" },
      { id: "kilo-auto/free", name: "Kilo Auto Free" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (Free)" },
      { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5 (Free)" },
      { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large Preview (Free)" },
    ],
    passthroughModels: true,
  },
};
