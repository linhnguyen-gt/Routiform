/**
 * Recent request outcomes per provider connection, read from `usage_history`.
 *
 * WHY THIS EXISTS. `provider_connections.test_status` is only written by an explicit
 * connection test, so it goes stale the moment a working key stops working: a connection
 * can sit at `test_status = 'active'` from a test months ago while every real request it
 * serves returns 400. Combo templates trusted that field alone, so a dead connection kept
 * being selected and kept burning a slot in the generated combo.
 *
 * `usage_history` is the honest record — one row per completed request, with `success`
 * set from the upstream outcome — so recent history is what "does this connection work"
 * should be answered from.
 *
 * @module lib/db/connectionUsageHealth
 */

import { getDbInstance } from "./core";

export interface ConnectionUsageHealth {
  /** Requests recorded for this connection inside the window. */
  attempts: number;
  /** How many of them succeeded. */
  successes: number;
}

/**
 * A week is long enough that a connection used occasionally still has a verdict, and
 * short enough that a key fixed today is not judged on last month's failures.
 */
export const CONNECTION_HEALTH_WINDOW_DAYS = 7;

/**
 * Recent attempt/success counts keyed by connection id. Connections with no requests in
 * the window are absent rather than zero-filled — "never used" and "used and failed" are
 * different states and callers must not collapse them.
 */
export function getConnectionUsageHealth(
  windowDays: number = CONNECTION_HEALTH_WINDOW_DAYS
): Record<string, ConnectionUsageHealth> {
  const db = getDbInstance();

  try {
    // Same `datetime('now', ?)` idiom the other usage_history queries use
    // (src/lib/db/settings.ts:731).
    const rows = db
      .prepare(
        `SELECT connection_id AS connectionId,
                COUNT(*) AS attempts,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes
         FROM usage_history
         WHERE connection_id IS NOT NULL
           AND connection_id != ''
           AND timestamp >= datetime('now', ?)
         GROUP BY connection_id`
      )
      .all(`-${windowDays} days`) as Array<{
      connectionId: string;
      attempts: number;
      successes: number | null;
    }>;

    const health: Record<string, ConnectionUsageHealth> = {};
    for (const row of rows) {
      health[row.connectionId] = {
        attempts: Number(row.attempts) || 0,
        successes: Number(row.successes) || 0,
      };
    }
    return health;
  } catch (error) {
    // A missing table or a locked DB must not fail the providers listing; callers treat
    // an absent entry as "no verdict", which is the safe direction.
    console.error("[DB] getConnectionUsageHealth failed:", (error as Error)?.message || error);
    return {};
  }
}
