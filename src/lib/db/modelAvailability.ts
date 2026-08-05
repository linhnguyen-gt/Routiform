/**
 * db/modelAvailability — the last known outcome of calling each model.
 *
 * Every model test the dashboard runs goes through `/api/models/test`, which issues a real
 * request via `/api/v1/chat/completions`, which records a row in `usage_history`. So the
 * answer to "can this account actually call this model" is already stored; it just was
 * never read back, which is why the green/red marks on the provider page vanished on
 * reload. This module reads it. No new table, and no extra upstream requests.
 */

import { getDbInstance } from "./core";

export interface ModelOutcome {
  /** Mirrors the per-model test states the provider page already renders. */
  status: "ok" | "error";
  /** ISO timestamp of the request this verdict comes from. */
  checkedAt: string;
  /** Upstream error code when the last call failed — e.g. "model_unavailable". */
  errorCode?: string;
}

interface OutcomeRow {
  model: string | null;
  success: number | null;
  error_code: string | null;
  timestamp: string | null;
}

/**
 * Latest outcome per model for one provider.
 *
 * This is the *last* result, not a durable capability claim: a model that failed once on a
 * rate limit reports "error" until it is called again. `checkedAt` and `errorCode` travel
 * alongside so callers can say when, and why, rather than implying permanence.
 */
export function getLatestModelOutcomes(provider: string): Record<string, ModelOutcome> {
  if (!provider) return {};

  const db = getDbInstance();
  // usage_history.id is a monotonic rowid, so MAX(id) per model is the newest row without
  // relying on timestamp ordering (which ties at the same millisecond).
  const rows = db
    .prepare(
      `SELECT model, success, error_code, timestamp
         FROM usage_history
        WHERE id IN (
          SELECT MAX(id) FROM usage_history WHERE provider = ? AND model IS NOT NULL GROUP BY model
        )`
    )
    .all(provider) as OutcomeRow[];

  const outcomes: Record<string, ModelOutcome> = {};
  for (const row of rows) {
    if (!row.model) continue;
    const outcome: ModelOutcome = {
      status: row.success ? "ok" : "error",
      checkedAt: row.timestamp ?? "",
    };
    if (!row.success && row.error_code) outcome.errorCode = row.error_code;
    outcomes[row.model] = outcome;
  }
  return outcomes;
}
