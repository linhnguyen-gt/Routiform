import type { ProviderMap } from "./types";

export const FREE_PROVIDERS = {
  qoder: { id: "qoder", alias: "qd", name: "Qoder", icon: "water_drop", color: "#EC4899" },
  kiro: { id: "kiro", alias: "kr", name: "Kiro AI", icon: "psychology_alt", color: "#FF6B35" },
} satisfies ProviderMap;

// Qoder previously lived here as PAT-only. After the device-flow OAuth
// upgrade (see open-sse/executors/qoder.ts + src/lib/oauth/services/qoder.ts),
// qoder is OAuth-first like kiro, so it's no longer in this set.
export const FREE_APIKEY_PROVIDER_IDS = new Set<string>([]);
