// Codex rate-limit scope + quota-header helpers.
// Extracted from executors/codex.ts (behavior unchanged) so the executor keeps
// only request/stream concerns. Consumers import these through
// executors/codex.ts, which re-exports them for backward compatibility.

// T09: Codex vs Spark Scope-Aware Rate Limiting
// Codex has two independent quota pools: "codex" (standard) and "spark" (premium).
// Exhausting one should NOT block requests to the other.

/**
 * Maps model name substrings to their rate-limit scope.
 * Checked in order — first match wins.
 */
const CODEX_SCOPE_PATTERNS: Array<{ pattern: string; scope: "codex" | "spark" }> = [
  { pattern: "codex-spark", scope: "spark" },
  { pattern: "spark", scope: "spark" },
  { pattern: "codex", scope: "codex" },
  { pattern: "gpt-5", scope: "codex" }, // gpt-5.2-codex, gpt-5.3-codex, etc.
];

/**
 * T09: Determine the rate-limit scope for a Codex model.
 * Use this key as the suffix for per-scope rate limit state:
 *   `${accountId}:${getModelScope(model)}`
 *
 * @param model - The Codex model ID (e.g. "gpt-5.3-codex", "codex-spark-mini")
 * @returns "codex" | "spark"
 */
export function getCodexModelScope(model: string): "codex" | "spark" {
  const lower = model.toLowerCase();
  for (const { pattern, scope } of CODEX_SCOPE_PATTERNS) {
    if (lower.includes(pattern)) return scope;
  }
  return "codex"; // default scope
}

/**
 * T09: Get the scope-keyed rate limit identifier for an account+model combination.
 * Use this as the key for rateLimitState maps to ensure scope isolation.
 */
export function getCodexRateLimitKey(accountId: string, model: string): string {
  return `${accountId}:${getCodexModelScope(model)}`;
}

/**
 * T03: Parsed quota snapshot from Codex response headers.
 * Codex includes per-account usage windows that allow precise reset scheduling.
 */
export interface CodexQuotaSnapshot {
  usage5h: number; // tokens used in 5h window
  limit5h: number; // token limit for 5h window
  resetAt5h: string | null; // ISO timestamp when 5h window resets
  usage7d: number; // tokens used in 7d window
  limit7d: number; // token limit for 7d window
  resetAt7d: string | null; // ISO timestamp when 7d window resets
}

/**
 * T03: Parse Codex-specific quota headers from a provider response.
 * Returns null if none of the relevant headers are present.
 *
 * Extracts:
 *   x-codex-5h-usage / x-codex-5h-limit / x-codex-5h-reset-at
 *   x-codex-7d-usage / x-codex-7d-limit / x-codex-7d-reset-at
 */
export function parseCodexQuotaHeaders(headers: Headers): CodexQuotaSnapshot | null {
  const usage5h = headers.get("x-codex-5h-usage");
  const limit5h = headers.get("x-codex-5h-limit");
  const resetAt5h = headers.get("x-codex-5h-reset-at");
  const usage7d = headers.get("x-codex-7d-usage");
  const limit7d = headers.get("x-codex-7d-limit");
  const resetAt7d = headers.get("x-codex-7d-reset-at");

  // Return null if none of the quota headers are present (not a quota-aware response)
  if (!usage5h && !limit5h && !resetAt5h && !usage7d && !limit7d && !resetAt7d) {
    return null;
  }

  return {
    usage5h: usage5h ? parseFloat(usage5h) : 0,
    limit5h: limit5h ? parseFloat(limit5h) : Infinity,
    resetAt5h: resetAt5h ?? null,
    usage7d: usage7d ? parseFloat(usage7d) : 0,
    limit7d: limit7d ? parseFloat(limit7d) : Infinity,
    resetAt7d: resetAt7d ?? null,
  };
}

/**
 * T03: Get the soonest quota reset time from a CodexQuotaSnapshot.
 * 7d window takes priority (wider window, harder limit) but we use whichever
 * is further in the future to avoid releasing the block too early.
 *
 * @returns Unix timestamp (ms) of the soonest effective reset, or null
 */
export function getCodexResetTime(quota: CodexQuotaSnapshot): number | null {
  const times: number[] = [];
  if (quota.resetAt7d) {
    const t = new Date(quota.resetAt7d).getTime();
    if (!isNaN(t) && t > Date.now()) times.push(t);
  }
  if (quota.resetAt5h) {
    const t = new Date(quota.resetAt5h).getTime();
    if (!isNaN(t) && t > Date.now()) times.push(t);
  }
  if (times.length === 0) return null;
  return Math.max(...times); // Use furthest-out reset to avoid premature unblock
}
