/**
 * Connection eligibility predicates shared by account selection and combo candidate scoring.
 *
 * These two paths must agree about which accounts exist. When the scorer counts a banned
 * account's quota but the selector refuses to use it, ordering and selection disagree and the
 * scorer prefers a provider it cannot actually reach.
 */

export interface ConnectionStatusView {
  testStatus?: string | null;
  rateLimitedUntil?: string | null;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/**
 * Whether a cooldown was recorded on this connection and has already passed.
 *
 * A status written alongside a cooldown is a statement about a window, not about the
 * account: whatever produced it was expected to lift on its own.
 */
function cooldownHasLapsed(connection: ConnectionStatusView): boolean {
  const until = connection.rateLimitedUntil;
  if (!until) return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at <= Date.now();
}

/**
 * A connection in a terminal state will never succeed without operator action, so it is
 * excluded from both selection and scoring rather than merely deprioritised.
 *
 * `credits_exhausted` is the one status that gets written for two different things: real
 * billing exhaustion, which carries no cooldown and does need operator action, and a plain
 * rate limit, which carries one. Once that cooldown has passed the connection is holding a
 * terminal status for a window that is already over — and because terminal connections are
 * never selected, it could never earn the successful request that clears the status again.
 */
export function isTerminalConnectionStatus(connection: ConnectionStatusView): boolean {
  const status = normalizeStatus(connection.testStatus);
  if (status === "credits_exhausted") return !cooldownHasLapsed(connection);
  return status === "banned" || status === "expired";
}
