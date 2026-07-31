/**
 * Resolves real quota data for auto-combo candidates.
 *
 * Candidates are keyed by `provider/model`; the quota cache is keyed by `connectionId`, and a
 * provider routinely has several connections. Turning one into the other is an aggregation
 * decision, not a lookup, and it drives 20% of the routing score — so the rule is explicit here
 * and pinned by tests.
 *
 * Rule:
 *   - Within one connection, remaining quota is the **minimum** across its windows. A connection
 *     whose weekly window is spent is spent, however fresh its 5-hour window looks.
 *   - Across connections, the provider's quota is the **maximum** over eligible connections. The
 *     selector will reach for the healthiest account, so the scorer must rank the provider by the
 *     best account it can actually use.
 *
 * Eligibility mirrors the filter in `getProviderCredentials` so ordering and selection do not
 * disagree about which accounts exist. Ownership split: the **selector** owns exhaustion (it
 * refuses to route to a spent account), the **scorer** owns preference (it ranks providers by how
 * much room they have). Quota therefore influences the outcome through two coordinated paths, not
 * two competing ones.
 */

import { isTerminalConnectionStatus } from "../../../src/domain/connection-eligibility";
import { getQuotaCache } from "../../../src/domain/quotaCache";

export interface CandidateQuota {
  quotaRemaining: number;
  quotaTotal: number;
  /** False when no eligible connection had a cache entry, so consumers can zero the weight. */
  quotaDataAvailable: boolean;
  /** Eligible connection count, so a 1-account provider is not read as a 5-account one. */
  quotaConnectionCount: number;
  quotaResetIntervalSecs?: number;
}

/** Percentage denominator; candidate quota is expressed as 0..100. */
const QUOTA_TOTAL = 100;

export const DEFAULT_CANDIDATE_QUOTA: CandidateQuota = {
  quotaRemaining: QUOTA_TOTAL,
  quotaTotal: QUOTA_TOTAL,
  quotaDataAvailable: false,
  quotaConnectionCount: 0,
};

const SECONDS_PER_UNIT: Record<string, number> = { h: 3600, d: 86400, w: 604800, m: 2592000 };
const NAMED_INTERVALS: Record<string, number> = {
  hourly: 3600,
  daily: 86400,
  weekly: 604800,
  monthly: 2592000,
};

/**
 * Derive a quota *cycle length* from a window key, e.g. "session (5h)" or "weekly (7d)".
 *
 * Returns null when the key carries no duration — model ids and opaque names like "session" or
 * "Ratelimit" are common. Null is deliberate: the tier factor treats a shorter cycle as better, so
 * inventing a default would hand every candidate the same fabricated signal. Note this is a cycle
 * length, not time-until-reset; `resetAt` cannot substitute for it.
 */
export function parseWindowIntervalSecs(windowKey: string): number | null {
  const key = String(windowKey || "").toLowerCase();

  const explicit = key.match(/\((\d+)\s*([hdwm])\)/);
  if (explicit) {
    const value = Number(explicit[1]);
    const unit = SECONDS_PER_UNIT[explicit[2] as string];
    if (Number.isFinite(value) && value > 0 && unit) return value * unit;
  }

  for (const [name, secs] of Object.entries(NAMED_INTERVALS)) {
    if (key.includes(name)) return secs;
  }

  return null;
}

interface ConnectionQuota {
  remaining: number;
  intervalSecs: number | null;
}

/**
 * Remaining quota for one connection: the most binding window, plus that window's cycle length.
 */
function resolveConnectionQuota(connectionId: string): ConnectionQuota | null {
  const entry = getQuotaCache(connectionId);
  if (!entry) return null;

  const windows = Object.entries(entry.quotas ?? {});
  if (windows.length === 0) return null;

  let remaining = Number.POSITIVE_INFINITY;
  let intervalSecs: number | null = null;

  for (const [windowKey, info] of windows) {
    const percentage = Number(info?.remainingPercentage);
    if (!Number.isFinite(percentage)) continue;
    if (percentage < remaining) {
      remaining = percentage;
      intervalSecs = parseWindowIntervalSecs(windowKey);
    }
  }

  if (!Number.isFinite(remaining)) return null;
  return { remaining: Math.max(0, Math.min(QUOTA_TOTAL, remaining)), intervalSecs };
}

export interface EligibleConnection {
  id: string;
}

/**
 * Aggregate quota across a provider's eligible connections.
 *
 * Callers pass connections already filtered for eligibility so this module stays free of the
 * request-scoped concerns (excluded ids, per-model lockouts) that only the selector knows about.
 */
export function aggregateConnectionQuota(connections: EligibleConnection[]): CandidateQuota {
  const resolved = connections
    .map((connection) => resolveConnectionQuota(connection.id))
    .filter((quota): quota is ConnectionQuota => quota !== null);

  if (resolved.length === 0) {
    return { ...DEFAULT_CANDIDATE_QUOTA, quotaConnectionCount: connections.length };
  }

  let best = resolved[0] as ConnectionQuota;
  for (const quota of resolved) {
    if (quota.remaining > best.remaining) best = quota;
  }

  return {
    quotaRemaining: best.remaining,
    quotaTotal: QUOTA_TOTAL,
    quotaDataAvailable: true,
    quotaConnectionCount: connections.length,
    ...(best.intervalSecs != null ? { quotaResetIntervalSecs: best.intervalSecs } : {}),
  };
}

interface ConnectionRow {
  id: string;
  testStatus?: string | null;
  rateLimitedUntil?: string | null;
}

/**
 * Filter a provider's connections down to the ones the selector would consider.
 *
 * Mirrors `getProviderCredentials`'s availability filter minus its request-scoped parts, which do
 * not exist at scoring time: there is no excluded-connection set and no in-flight attempt yet.
 */
export function filterEligibleConnections(
  connections: ConnectionRow[],
  isUnavailable: (rateLimitedUntil: string | null | undefined) => boolean
): EligibleConnection[] {
  return connections.filter((connection) => {
    if (isTerminalConnectionStatus(connection)) return false;
    if (isUnavailable(connection.rateLimitedUntil)) return false;
    return true;
  });
}
