/**
 * Resolves which HTTP status codes should trigger global fallback after a combo
 * exhausts all models (#689 + extended opt-in for 429/504).
 */
const DEFAULT_GLOBAL_FALLBACK_STATUSES = [502, 503];

export function getGlobalFallbackStatusCodes(
  settings: Record<string, unknown> | null | undefined
): number[] {
  const raw = settings?.globalFallbackStatusCodes;
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 100 && n <= 599)
  ) {
    return [...new Set(raw.map((n) => Math.round(n as number)))].sort((a, b) => a - b);
  }
  return [...DEFAULT_GLOBAL_FALLBACK_STATUSES];
}
