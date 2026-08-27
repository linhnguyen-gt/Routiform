import {
  getBreakerKey,
  isProviderBlocked,
  recordSuccess,
  recordFailure,
} from "./circuitBreaker.ts";

const REFRESH_TIMEOUT_MS = 30_000; // 30s max per refresh attempt

/**
 * Execute a function with a timeout.
 *
 * The race deliberately does NOT cancel or abort fn(): for rotating providers (Codex) the IdP
 * has often already consumed the single-use refresh token by the time the caller's deadline
 * expires, and destroying the in-flight request would discard the response carrying the NEW
 * refresh token. The promise keeps running — its dedup cache entry survives until it settles,
 * so refreshWithRetry's next attempt shares the same request instead of re-posting the token —
 * and a successful outcome is parked by getAccessToken (lateRefreshResults) for the next caller
 * to pick up through the normal refresh path.
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  // The timer is cleared once the race settles. Left dangling it keeps its closure — and the
  // event loop — alive for the full 30 seconds after every refresh that already finished.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Refresh token with retry and exponential backoff
 * Retries on failure with increasing delay: 1s, 2s, 3s...
 *
 * Includes:
 * - Per-connection circuit breaker (5 consecutive failures → 30min pause)
 * - 30s timeout per refresh attempt to prevent hanging connections
 *
 * @param {function} refreshFn - Async function that returns token or null
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @param {object} log - Logger instance (optional)
 * @param {string} provider - Provider ID for circuit breaker tracking (optional)
 * @returns {Promise<object|null>} Token result or null if all retries fail
 */

/**
 * The chat path has TWO independent refresh entry points, with different semantics, and only one
 * of them reaches this function:
 *   - proactive:  src/sse/handlers/chat.ts:510 → src/sse/services/tokenRefresh.ts:150 →
 *                 getAccessToken. No retry, no circuit breaker.
 *   - reactive:   handlers/chat-core/chat-core-phase-upstream-oauth-retry.ts, on a 401/403.
 *                 3 retries, breaker-protected — this function.
 * Do not assume breaker coverage on the proactive path. Reconciling the two is a separate job.
 */
export async function refreshWithRetry(
  refreshFn,
  maxRetries = 3,
  log = null,
  provider = "unknown",
  connectionId: string | null = null
) {
  const breakerKey = getBreakerKey(provider, connectionId);

  // Circuit breaker check
  if (isProviderBlocked(provider, connectionId)) {
    log?.warn?.("TOKEN_REFRESH", `⚡ Circuit breaker active for ${breakerKey}, skipping refresh`);
    return null;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1000;
      log?.debug?.("TOKEN_REFRESH", `Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const result = await withTimeout(refreshFn, REFRESH_TIMEOUT_MS);
      if (result) {
        recordSuccess(provider, connectionId);
        return result;
      }
    } catch (error) {
      log?.warn?.("TOKEN_REFRESH", `Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
    }
  }

  // All retries exhausted — record failure for circuit breaker
  recordFailure(provider, log, connectionId);
  log?.error?.("TOKEN_REFRESH", `All ${maxRetries} retry attempts failed for ${breakerKey}`);
  return null;
}
