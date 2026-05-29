import type { ProviderMap } from "./types";

export const FREE_PROVIDERS = {
  qoder: { id: "qoder", alias: "if", name: "Qoder AI", icon: "water_drop", color: "#6366F1" },
  qwen: { id: "qwen", alias: "qw", name: "Qwen Code", icon: "psychology", color: "#10B981" },
  "gemini-cli": {
    id: "gemini-cli",
    alias: "gemini-cli",
    name: "Gemini CLI",
    icon: "terminal",
    color: "#4285F4",
    deprecated: true,
    deprecationReason:
      "Google restricts third-party OAuth usage for Gemini CLI (Mar 2026). Pro models require paid plans. Use 'gemini' (API key) provider instead.",
  },
  kiro: { id: "kiro", alias: "kr", name: "Kiro AI", icon: "psychology_alt", color: "#FF6B35" },
} satisfies ProviderMap;

export const FREE_APIKEY_PROVIDER_IDS = new Set(["qoder"]);
