/**
 * Documented free-tier notes for providers already registered in Routiform.
 * Static / honest — not live quota telemetry. Pool-deduped marketing claims
 * intentionally avoided; figures are approximate and terms-dependent.
 */

export type FreeTierKind = "forever" | "signup-credit" | "daily" | "rate-limited" | "oauth-sub";

export type FreeTierEntry = {
  providerId: string;
  name: string;
  kind: FreeTierKind;
  /** Short human summary (English). */
  summary: string;
  /** Optional approximate monthly free tokens (null = unknown / uncapped / N/A). */
  approxTokensPerMonth: number | null;
  notes?: string;
};

/** Catalog of free / freemium surfaces among current provider IDs. */
export const FREE_TIER_CATALOG: readonly FreeTierEntry[] = [
  {
    providerId: "qoder",
    name: "Qoder",
    kind: "forever",
    summary: "Free OAuth coding models (device flow).",
    approxTokensPerMonth: null,
    notes: "Unlimited free tier subject to provider ToS / rate limits.",
  },
  {
    providerId: "kiro",
    name: "Kiro AI",
    kind: "forever",
    summary: "Free OAuth provider with credit tracking in dashboard.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "pollinations",
    name: "Pollinations",
    kind: "forever",
    summary: "No key required for many models.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "puter",
    name: "Puter",
    kind: "forever",
    summary: "Browser/auth free tier for selected models.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "longcat",
    name: "LongCat",
    kind: "signup-credit",
    summary: "One-time free token grant (KYC may apply).",
    approxTokensPerMonth: 10_000_000,
  },
  {
    providerId: "cloudflare-ai",
    name: "Cloudflare AI",
    kind: "daily",
    summary: "Neurons free allocation on Workers AI.",
    approxTokensPerMonth: null,
    notes: "~10k neurons/day class free tier (varies by plan).",
  },
  {
    providerId: "nvidia",
    name: "NVIDIA NIM",
    kind: "rate-limited",
    summary: "Free NIM endpoints with RPM caps.",
    approxTokensPerMonth: null,
    notes: "~40 RPM class free access on many models.",
  },
  {
    providerId: "cerebras",
    name: "Cerebras",
    kind: "daily",
    summary: "Daily free token pool on free tier.",
    approxTokensPerMonth: 30_000_000,
    notes: "~1M tokens/day class free tier when available.",
  },
  {
    providerId: "groq",
    name: "Groq",
    kind: "rate-limited",
    summary: "Free tier with rate limits (API key).",
    approxTokensPerMonth: null,
  },
  {
    providerId: "gemini",
    name: "Google Gemini",
    kind: "rate-limited",
    summary: "Google AI Studio free quota (API key).",
    approxTokensPerMonth: null,
  },
  {
    providerId: "openrouter",
    name: "OpenRouter",
    kind: "signup-credit",
    summary: "Free routes + occasional free model tags; paid unlocks more.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "huggingface",
    name: "Hugging Face",
    kind: "rate-limited",
    summary: "Inference free tier / serverless limits.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "siliconflow",
    name: "SiliconFlow",
    kind: "forever",
    summary: "Free models on platform free tier.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "opencode-zen",
    name: "OpenCode Zen",
    kind: "forever",
    summary: "Free gateway tier when enabled.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "opencode-go",
    name: "OpenCode Go",
    kind: "forever",
    summary: "Free gateway tier when enabled.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "claude",
    name: "Claude Code (OAuth)",
    kind: "oauth-sub",
    summary: "Uses your Claude subscription quota via OAuth — not free forever.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "codex",
    name: "Codex (OAuth)",
    kind: "oauth-sub",
    summary: "Uses ChatGPT/Codex subscription quota via OAuth.",
    approxTokensPerMonth: null,
  },
  {
    providerId: "github",
    name: "GitHub Copilot",
    kind: "oauth-sub",
    summary: "Uses Copilot subscription quota.",
    approxTokensPerMonth: null,
  },
] as const;

export function listFreeTierCatalog(): readonly FreeTierEntry[] {
  return FREE_TIER_CATALOG;
}

export function summarizeFreeTierCatalog(): {
  total: number;
  forever: number;
  oauthSub: number;
  approxKnownMonthlyTokens: number;
} {
  let forever = 0;
  let oauthSub = 0;
  let approxKnownMonthlyTokens = 0;
  for (const e of FREE_TIER_CATALOG) {
    if (e.kind === "forever") forever += 1;
    if (e.kind === "oauth-sub") oauthSub += 1;
    if (typeof e.approxTokensPerMonth === "number") {
      approxKnownMonthlyTokens += e.approxTokensPerMonth;
    }
  }
  return {
    total: FREE_TIER_CATALOG.length,
    forever,
    oauthSub,
    approxKnownMonthlyTokens,
  };
}
