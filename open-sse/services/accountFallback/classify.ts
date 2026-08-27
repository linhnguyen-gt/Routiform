import { HTTP_STATUS, RateLimitReason } from "../../config/constants.ts";
import { isAccountDeactivated, isCreditsExhausted } from "./signals.ts";

/**
 * Parse delay strings like "33s", "2m", "1h", "1500ms"
 */
function parseDelayString(value) {
  if (!value) return null;
  const str = String(value).trim();
  const msMatch = str.match(/^(\d+)\s*ms$/i);
  if (msMatch) return parseInt(msMatch[1], 10);
  const secMatch = str.match(/^(\d+)\s*s$/i);
  if (secMatch) return parseInt(secMatch[1], 10) * 1000;
  const minMatch = str.match(/^(\d+)\s*m$/i);
  if (minMatch) return parseInt(minMatch[1], 10) * 60 * 1000;
  const hrMatch = str.match(/^(\d+)\s*h$/i);
  if (hrMatch) return parseInt(hrMatch[1], 10) * 3600 * 1000;
  // Bare number → seconds
  const num = parseInt(str, 10);
  return isNaN(num) ? null : num * 1000;
}

/**
 * Compute total milliseconds from regex match groups (Xh)(Ym)(Zs)
 */
function computeDurationMs(match) {
  let totalMs = 0;
  if (match[1]) totalMs += parseInt(match[1], 10) * 3600 * 1000; // hours
  if (match[2]) totalMs += parseInt(match[2], 10) * 60 * 1000; // minutes
  if (match[3]) totalMs += parseInt(match[3], 10) * 1000; // seconds
  return totalMs > 0 ? totalMs : null;
}

/**
 * Parse retry-after information from JSON error response bodies.
 * Providers embed retry info in different formats.
 *
 * @param {string|object} responseBody - Raw response body or parsed JSON
 * @returns {{ retryAfterMs: number|null, reason: string }}
 */
export function parseRetryAfterFromBody(responseBody) {
  let body;
  try {
    body = typeof responseBody === "string" ? JSON.parse(responseBody) : responseBody;
  } catch {
    return { retryAfterMs: null, reason: RateLimitReason.UNKNOWN };
  }

  if (!body) return { retryAfterMs: null, reason: RateLimitReason.UNKNOWN };

  // Gemini: { error: { details: [{ retryDelay: "33s" }] } }
  const details = body.error?.details || body.details || [];
  for (const detail of Array.isArray(details) ? details : []) {
    if (detail.retryDelay) {
      return {
        retryAfterMs: parseDelayString(detail.retryDelay),
        reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
      };
    }
  }

  // OpenAI: "Please retry after 20s" in message
  const msg = body.error?.message || body.message || "";
  const retryMatch = msg.match(/retry\s+after\s+(\d+)\s*s/i);
  if (retryMatch) {
    return {
      retryAfterMs: parseInt(retryMatch[1], 10) * 1000,
      reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
    };
  }

  // Anthropic: error type classification
  const errorType = body.error?.type || body.type || "";
  if (errorType === "rate_limit_error") {
    return { retryAfterMs: null, reason: RateLimitReason.RATE_LIMIT_EXCEEDED };
  }

  // Classify by error message keywords
  const reason = classifyErrorText(msg || errorType);
  return { retryAfterMs: null, reason };
}

/**
 * T07: Parse retry time from error text body with combined "XhYmZs" format.
 * Examples: "Your quota will reset after 2h30m14s", "reset after 45m", "reset after 30s"
 * Returns milliseconds or null if not parseable.
 *
 * @param {string} errorText - Error message text from response body
 * @returns {number|null} Retry duration in milliseconds
 */
export function parseRetryFromErrorText(errorText) {
  if (!errorText || typeof errorText !== "string") return null;

  // "reset after XhYmZs" also matches "will reset after XhYmZs", so one
  // regex covers both phrasings — there is no separate alt-match case.
  const match = errorText.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
  if (!match) return null;

  return computeDurationMs(match);
}

// ─── Error Classification ───────────────────────────────────────────────────

/**
 * Classify error text into RateLimitReason
 */
export function classifyErrorText(errorText) {
  if (!errorText) return RateLimitReason.UNKNOWN;
  const lower = String(errorText).toLowerCase();

  if (
    lower.includes("quota exceeded") ||
    lower.includes("quota depleted") ||
    lower.includes("quota will reset") ||
    lower.includes("your quota will reset") ||
    lower.includes("billing")
  ) {
    return RateLimitReason.QUOTA_EXHAUSTED;
  }
  // T10: credits_exhausted signals
  if (isCreditsExhausted(errorText)) {
    return RateLimitReason.QUOTA_EXHAUSTED;
  }
  // T06: account_deactivated signals
  if (isAccountDeactivated(errorText)) {
    return RateLimitReason.AUTH_ERROR;
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("rate_limit")
  ) {
    return RateLimitReason.RATE_LIMIT_EXCEEDED;
  }
  if (
    lower.includes("capacity") ||
    lower.includes("overloaded") ||
    lower.includes("resource exhausted")
  ) {
    return RateLimitReason.MODEL_CAPACITY;
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication")
  ) {
    return RateLimitReason.AUTH_ERROR;
  }
  if (lower.includes("server error") || lower.includes("internal error")) {
    return RateLimitReason.SERVER_ERROR;
  }
  return RateLimitReason.UNKNOWN;
}

/**
 * Classify HTTP status + error text into RateLimitReason
 */
export function classifyError(status, errorText) {
  // Text classification takes priority (more specific)
  const textReason = classifyErrorText(errorText);
  if (textReason !== RateLimitReason.UNKNOWN) return textReason;

  // Fall back to status code
  if (status === HTTP_STATUS.UNAUTHORIZED || status === HTTP_STATUS.FORBIDDEN) {
    return RateLimitReason.AUTH_ERROR;
  }
  if (status === HTTP_STATUS.PAYMENT_REQUIRED) {
    return RateLimitReason.QUOTA_EXHAUSTED;
  }
  if (status === HTTP_STATUS.RATE_LIMITED) {
    return RateLimitReason.RATE_LIMIT_EXCEEDED;
  }
  if (status === HTTP_STATUS.SERVICE_UNAVAILABLE || status === 529) {
    return RateLimitReason.MODEL_CAPACITY;
  }
  if (status >= 500) {
    return RateLimitReason.SERVER_ERROR;
  }
  return RateLimitReason.UNKNOWN;
}
