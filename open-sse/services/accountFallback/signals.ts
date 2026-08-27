// T06 (sub2api PR #1037): Signals that indicate permanent account deactivation.
// When a 401 body contains these strings, the account is permanently dead
// and should NOT be retried after token refresh.
export const ACCOUNT_DEACTIVATED_SIGNALS = [
  "account_deactivated",
  "account has been deactivated",
  "account has been disabled",
  "your account has been suspended",
  "this account is deactivated",
  // AG (Antigravity/Google Cloud Code) permanent ban signals
  "verify your account to continue",
  "this service has been disabled in this account for violation",
  "this service has been disabled in this account",
];

// T10 (sub2api PR #1169): Signals that indicate billing credits are exhausted.
// Distinct from rate-limit 429 — the account won't recover until credits are added.
// NOTE: "insufficient_quota" removed — too broad, matches temporary capacity issues
export const CREDITS_EXHAUSTED_SIGNALS = [
  "billing_hard_limit_reached",
  "exceeded your current quota",
  "credit_balance_too_low",
  "your credit balance is too low",
  "credits exhausted",
  "out of credits",
  "payment required",
];

// T11: Signals that indicate OAuth token is invalid/expired (not permanent deactivation)
export const OAUTH_INVALID_TOKEN_SIGNALS = [
  "invalid authentication credentials",
  "oauth 2",
  "login cookie",
  "valid authentication credential",
  "invalid credentials",
];

/**
 * T06: Returns true if response body indicates the account is permanently deactivated.
 */
export function isAccountDeactivated(errorText: string): boolean {
  const lower = String(errorText || "").toLowerCase();
  return ACCOUNT_DEACTIVATED_SIGNALS.some((sig) => lower.includes(sig));
}

/**
 * T10: Returns true if response body indicates credits/quota are permanently exhausted.
 */
export function isCreditsExhausted(errorText: string): boolean {
  const lower = String(errorText || "").toLowerCase();
  return CREDITS_EXHAUSTED_SIGNALS.some((sig) => lower.includes(sig));
}

/**
 * T11: Returns true if response body indicates OAuth token is invalid/expired.
 * This is different from permanent account deactivation - token refresh can recover.
 */
export function isOAuthInvalidToken(errorText: string): boolean {
  const lower = String(errorText || "").toLowerCase();
  return OAUTH_INVALID_TOKEN_SIGNALS.some((sig) => lower.includes(sig));
}
