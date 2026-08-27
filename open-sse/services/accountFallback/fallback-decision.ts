import { parseResetTime } from "../../services/usage/reset-time.ts";
import {
  BACKOFF_CONFIG,
  COOLDOWN_MS,
  HTTP_STATUS,
  RateLimitReason,
} from "../../config/constants.ts";
import { getProviderProfile } from "./provider-profile.ts";
import { isAccountDeactivated, isCreditsExhausted } from "./signals.ts";
import { classifyErrorText, parseRetryFromErrorText } from "./classify.ts";
import { getQuotaCooldown } from "./backoff.ts";

function parseResetTimestampFromHeaders(headers) {
  if (!headers) return null;

  const pick = (name: string, altName: string): string | null =>
    typeof headers.get === "function"
      ? headers.get(name)
      : headers[name] || headers[altName] || null;

  const retryAfter = pick("retry-after", "Retry-After");
  if (retryAfter) {
    const retryStr = String(retryAfter).trim();
    // Retry-After carries a delay in seconds or an HTTP-date — never an epoch.
    const seconds = parseInt(retryStr, 10);
    if (!isNaN(seconds) && String(seconds) === retryStr) {
      return Date.now() + seconds * 1000;
    }
    // Absolute date form — delegate to the shared reset-time parser.
    const iso = parseResetTime(retryStr);
    if (iso) return new Date(iso).getTime();
  }

  const rlReset = pick("x-ratelimit-reset", "X-RateLimit-Reset");
  if (rlReset) {
    // Epoch seconds or milliseconds — the shared parser normalizes both.
    const iso = parseResetTime(String(rlReset).trim());
    if (iso) return new Date(iso).getTime();
  }

  return null;
}

function getHeaderCooldownMs(headers) {
  const resetTime = parseResetTimestampFromHeaders(headers);
  if (!resetTime) return null;
  const waitMs = resetTime - Date.now();
  return waitMs > 0 ? waitMs : null;
}

/**
 * Check if error should trigger account fallback (switch to next account)
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text
 * @param {number} backoffLevel - Current backoff level for exponential backoff
 * @param {string} [model] - Optional model name for model-level lockout
 * @param {string} [provider] - Provider ID for profile-aware cooldowns
 * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number, reason?: string }}
 */
export function checkFallbackError(
  status,
  errorText,
  backoffLevel = 0,
  _model = null,
  provider = null,
  headers = null
) {
  const errorStr = (errorText || "").toString();

  // P0-E: explicit 429 + Retry-After (or x-ratelimit-reset) takes precedence
  // over body/text heuristics.
  const headerCooldownMs = getHeaderCooldownMs(headers);
  if (status === HTTP_STATUS.RATE_LIMITED && headerCooldownMs !== null) {
    return {
      shouldFallback: true,
      cooldownMs: headerCooldownMs,
      newBackoffLevel: 0,
      reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
    };
  }

  // Check error message FIRST - specific patterns take priority over status codes
  if (errorText) {
    const lowerError = errorStr.toLowerCase();

    // Subscription/capacity errors are temporary upstream issues, not permanent bans
    if (
      lowerError.includes("subscription is required") ||
      lowerError.includes("requires a subscription") ||
      lowerError.includes("upgrade for access") ||
      lowerError.includes("high volume") ||
      lowerError.includes("capacity is being added")
    ) {
      return {
        shouldFallback: true,
        cooldownMs: COOLDOWN_MS.rateLimit ?? 60 * 1000, // 1min cooldown
        reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
      };
    }

    // T06 (sub2api #1037): Permanent account deactivation — do NOT retry, mark as permanent failure
    if (isAccountDeactivated(errorStr)) {
      return {
        shouldFallback: true,
        cooldownMs: 365 * 24 * 60 * 60 * 1000, // 1 year = effectively permanent
        reason: RateLimitReason.AUTH_ERROR,
        permanent: true,
      };
    }

    // T10 (sub2api #1169): Credits/quota exhausted — long cooldown, distinct from rate limit
    if (isCreditsExhausted(errorStr)) {
      return {
        shouldFallback: true,
        cooldownMs: COOLDOWN_MS.paymentRequired ?? 3600 * 1000, // 1h cooldown
        reason: RateLimitReason.QUOTA_EXHAUSTED,
        creditsExhausted: true,
      };
    }

    if (lowerError.includes("no credentials")) {
      return {
        shouldFallback: true,
        cooldownMs: COOLDOWN_MS.notFound,
        reason: RateLimitReason.AUTH_ERROR,
      };
    }

    if (lowerError.includes("request not allowed")) {
      return {
        shouldFallback: true,
        cooldownMs: COOLDOWN_MS.requestNotAllowed,
        reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
      };
    }

    // Rate limit keywords - exponential backoff
    if (
      lowerError.includes("rate limit") ||
      lowerError.includes("too many requests") ||
      lowerError.includes("quota exceeded") ||
      lowerError.includes("quota will reset") ||
      lowerError.includes("exhausted your capacity") ||
      lowerError.includes("quota exhausted") ||
      lowerError.includes("capacity") ||
      lowerError.includes("overloaded")
    ) {
      const resetTime = parseResetTimestampFromHeaders(headers);
      if (resetTime) {
        const waitMs = resetTime - Date.now();
        if (waitMs > 60_000) {
          return {
            shouldFallback: true,
            cooldownMs: waitMs,
            newBackoffLevel: 0,
            reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
          };
        }
      }
      const retryFromBody = parseRetryFromErrorText(errorStr);
      if (retryFromBody && retryFromBody > 60_000) {
        return {
          shouldFallback: true,
          cooldownMs: retryFromBody,
          newBackoffLevel: 0,
          reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
        };
      }
      const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
      const reason = classifyErrorText(errorStr);
      return {
        shouldFallback: true,
        cooldownMs: getQuotaCooldown(backoffLevel),
        newBackoffLevel: newLevel,
        reason,
      };
    }
  }

  // 401 workspace billing (e.g. OpenCode Zen "Insufficient balance") — not a bad API key.
  // Applying the default 401 connection cooldown would block *all* models for ~2 minutes, including
  // free-tier models that still work. Return without marking the connection unavailable.
  if (status === HTTP_STATUS.UNAUTHORIZED) {
    const lower = errorStr.toLowerCase();
    if (lower.includes("insufficient balance") || lower.includes("manage your billing")) {
      return {
        shouldFallback: false,
        cooldownMs: 0,
        reason: RateLimitReason.AUTH_ERROR,
      };
    }
    return {
      shouldFallback: true,
      cooldownMs: COOLDOWN_MS.unauthorized,
      reason: RateLimitReason.AUTH_ERROR,
    };
  }

  if (status === HTTP_STATUS.PAYMENT_REQUIRED || status === HTTP_STATUS.FORBIDDEN) {
    return {
      shouldFallback: true,
      cooldownMs: COOLDOWN_MS.paymentRequired,
      reason: RateLimitReason.QUOTA_EXHAUSTED,
    };
  }

  if (status === HTTP_STATUS.NOT_FOUND) {
    return {
      shouldFallback: true,
      cooldownMs: COOLDOWN_MS.notFound,
      reason: RateLimitReason.UNKNOWN,
    };
  }

  // 429 - Rate limit with exponential backoff
  if (status === HTTP_STATUS.RATE_LIMITED) {
    const resetTime = parseResetTimestampFromHeaders(headers);
    if (resetTime) {
      const waitMs = resetTime - Date.now();
      if (waitMs > 60_000) {
        return {
          shouldFallback: true,
          cooldownMs: waitMs,
          newBackoffLevel: 0,
          reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
        };
      }
    }

    const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
    return {
      shouldFallback: true,
      cooldownMs: getQuotaCooldown(backoffLevel),
      newBackoffLevel: newLevel,
      reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
    };
  }

  // Transient / server errors — exponential backoff with provider profile
  const transientStatuses = [
    HTTP_STATUS.NOT_ACCEPTABLE,
    HTTP_STATUS.REQUEST_TIMEOUT,
    HTTP_STATUS.SERVER_ERROR,
    HTTP_STATUS.BAD_GATEWAY,
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    HTTP_STATUS.GATEWAY_TIMEOUT,
  ];
  if (transientStatuses.includes(status)) {
    const resetTime = parseResetTimestampFromHeaders(headers);
    if (resetTime) {
      const waitMs = resetTime - Date.now();
      if (waitMs > 60_000) {
        return {
          shouldFallback: true,
          cooldownMs: waitMs,
          newBackoffLevel: 0,
          reason: RateLimitReason.SERVER_ERROR,
        };
      }
    }

    const profile = provider ? getProviderProfile(provider) : null;
    const baseCooldown = profile?.transientCooldown ?? COOLDOWN_MS.transientInitial;
    const maxLevel = profile?.maxBackoffLevel ?? BACKOFF_CONFIG.maxLevel;
    const cooldownMs = Math.min(baseCooldown * Math.pow(2, backoffLevel), COOLDOWN_MS.transientMax);
    const newLevel = Math.min(backoffLevel + 1, maxLevel);
    return {
      shouldFallback: true,
      cooldownMs,
      newBackoffLevel: newLevel,
      reason: RateLimitReason.SERVER_ERROR,
    };
  }

  // 400 Bad Request - don't fallback (same request will fail on all accounts)
  if (status === HTTP_STATUS.BAD_REQUEST) {
    return { shouldFallback: false, cooldownMs: 0, reason: RateLimitReason.UNKNOWN };
  }

  // All other errors - fallback with transient cooldown
  return {
    shouldFallback: true,
    cooldownMs: COOLDOWN_MS.transient,
    reason: RateLimitReason.UNKNOWN,
  };
}
