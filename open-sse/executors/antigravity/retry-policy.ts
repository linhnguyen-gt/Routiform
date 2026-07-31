/**
 * Retry-timing helpers for Antigravity 429/503 responses.
 *
 * @module executors/antigravity/retry-policy
 */
import type { AntigravityLog } from "./types.ts";

export const MAX_RETRY_AFTER_MS = 60_000;
export const LONG_RETRY_THRESHOLD_MS = 60_000;
export const MAX_AUTO_RETRIES = 3;

/** Minimum backoff for "reset after 0s" (burst/RPM limit, not quota exhaustion). */
const BURST_LIMIT_BACKOFF_MS = 2_000;

/** Read the retry delay from standard rate-limit headers. */
export function parseRetryHeaders(headers: Headers): number | null {
  if (!headers?.get) return null;

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;

    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      const diff = date.getTime() - Date.now();
      return diff > 0 ? diff : null;
    }
  }

  const resetAfter = headers.get("x-ratelimit-reset-after");
  if (resetAfter) {
    const seconds = parseInt(resetAfter, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }

  const resetTimestamp = headers.get("x-ratelimit-reset");
  if (resetTimestamp) {
    const ts = parseInt(resetTimestamp, 10) * 1000;
    const diff = ts - Date.now();
    return diff > 0 ? diff : null;
  }

  return null;
}

/**
 * Parse retry time from an Antigravity error message body.
 * Format: "Your quota will reset after 2h7m23s" or "1h30m" or "45m" or "30s".
 */
export function parseRetryFromErrorMessage(errorMessage: string): number | null {
  if (!errorMessage || typeof errorMessage !== "string") return null;

  const match = errorMessage.match(/reset (?:after|in) (\d+h)?(\d+m)?(\d+s)?/i);
  if (!match) return null;

  let totalMs = 0;
  if (match[1]) totalMs += parseInt(match[1]) * 3600 * 1000; // hours
  if (match[2]) totalMs += parseInt(match[2]) * 60 * 1000; // minutes
  if (match[3]) totalMs += parseInt(match[3]) * 1000; // seconds

  // "reset after 0s" = burst/RPM limit, not quota exhaustion.
  // Return a minimum backoff so the auto-retry loop handles it
  // instead of falling through to the 24h exhaustion classifier.
  if (totalMs === 0) return BURST_LIMIT_BACKOFF_MS;

  return totalMs;
}

/**
 * Embed a long retry delay into the 429 body so downstream consumers can show
 * an accurate cooldown. Returns null when the body cannot be rewritten — the
 * caller then forwards the original response.
 */
export async function embedRetryAfterMs(
  response: Response,
  retryMs: number,
  log?: AntigravityLog
): Promise<Response | null> {
  try {
    const respBody = await response.clone().text();
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(respBody) as Record<string, unknown>;
    } catch {
      obj = {};
    }
    obj.retryAfterMs = retryMs;
    return new Response(JSON.stringify(obj), {
      status: response.status,
      headers: response.headers,
    });
  } catch (err) {
    log?.warn?.("RETRY", `Failed to embed retryAfterMs: ${err}`);
    // Fall back to the original response
    return null;
  }
}
