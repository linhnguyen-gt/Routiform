import { pbkdf2Sync } from "node:crypto";

const CACHE_SECRET = "routiform-token-cache";

// ─── Late-arriving refresh results (rotating-token safety) ──────────────────
// Key: "provider:sha256(refreshToken)" → Value: Promise<result>
export const refreshPromiseCache = new Map();

// How long a refresh result that settled after its caller stopped waiting stays retrievable.
const LATE_RESULT_TTL_MS = 10 * 60 * 1000;

// Refresh results that settled AFTER the caller's timeout expired. Keyed exactly like
// refreshPromiseCache (provider + hash of the OLD refresh token). For rotating providers
// (Codex) the IdP has usually already consumed the single-use refresh token by the time the
// response lands — discarding that response permanently loses the NEW refresh token and
// forces manual re-auth. Parked results are served by getAccessToken through its normal
// return path, so whoever asks next persists them like any freshly refreshed credential.
const lateRefreshResults = new Map();

export function parkLateRefreshResult(cacheKey, result) {
  const now = Date.now();
  for (const [key, entry] of lateRefreshResults) {
    if (entry.settledAt + LATE_RESULT_TTL_MS <= now) lateRefreshResults.delete(key);
  }
  lateRefreshResults.set(cacheKey, { result, settledAt: now });
}

export function peekLateRefreshResult(cacheKey) {
  const entry = lateRefreshResults.get(cacheKey);
  if (!entry) return null;
  if (entry.settledAt + LATE_RESULT_TTL_MS <= Date.now()) {
    lateRefreshResults.delete(cacheKey);
    return null;
  }
  return entry.result;
}

export function getRefreshCacheKey(provider, refreshToken) {
  const tokenHash = pbkdf2Sync(refreshToken, CACHE_SECRET, 1000, 32, "sha256").toString("hex");
  return `${provider}:${tokenHash}`;
}
