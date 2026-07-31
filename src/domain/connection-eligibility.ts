/**
 * Connection eligibility predicates shared by account selection and combo candidate scoring.
 *
 * These two paths must agree about which accounts exist. When the scorer counts a banned
 * account's quota but the selector refuses to use it, ordering and selection disagree and the
 * scorer prefers a provider it cannot actually reach.
 */

export interface ConnectionStatusView {
  testStatus?: string | null;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/**
 * A connection in a terminal state will never succeed without operator action, so it is
 * excluded from both selection and scoring rather than merely deprioritised.
 */
export function isTerminalConnectionStatus(connection: ConnectionStatusView): boolean {
  const status = normalizeStatus(connection.testStatus);
  return status === "credits_exhausted" || status === "banned" || status === "expired";
}
