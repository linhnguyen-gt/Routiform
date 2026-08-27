import { BACKOFF_CONFIG, BACKOFF_STEPS_MS } from "../../config/constants.ts";

// ─── Configurable Backoff ───────────────────────────────────────────────────

/**
 * Get backoff duration from configurable steps.
 * @param {number} failureCount - Number of consecutive failures
 * @returns {number} Duration in ms
 */
export function getBackoffDuration(failureCount) {
  const idx = Math.min(failureCount, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[idx];
}

// ─── Original API (Backward Compatible) ────────────────────────────────────

/**
 * Calculate exponential backoff cooldown for rate limits (429)
 * Level 0: 1s, Level 1: 2s, Level 2: 4s... → max 2 min
 * @param {number} backoffLevel - Current backoff level
 * @returns {number} Cooldown in milliseconds
 */
export function getQuotaCooldown(backoffLevel = 0) {
  const cooldown = BACKOFF_CONFIG.base * Math.pow(2, backoffLevel);
  return Math.min(cooldown, BACKOFF_CONFIG.max);
}
