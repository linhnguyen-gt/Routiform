/**
 * quotaPreflight.ts — Feature 04
 * Quota Preflight & Troca Proativa de Conta
 *
 * Toggle: providerSpecificData.quotaPreflightEnabled (default: false)
 * Providers register quota fetchers via registerQuotaFetcher().
 * Graceful degradation when no fetcher registered.
 */

export interface PreflightQuotaResult {
  proceed: boolean;
  reason?: string;
  quotaPercent?: number;
}

export interface QuotaInfo {
  used: number;
  total: number;
  percentUsed: number;
}

export type QuotaFetcher = (connectionId: string) => Promise<QuotaInfo | null>;

const EXHAUSTION_THRESHOLD = 0.98;
const WARN_THRESHOLD = 0.8;

const quotaFetcherRegistry = new Map<string, QuotaFetcher>();

export function registerQuotaFetcher(provider: string, fetcher: QuotaFetcher): void {
  quotaFetcherRegistry.set(provider, fetcher);
}

// ─── Fetcher Failure Telemetry ──────────────────────────────────────────────
// Fetcher failures are swallowed (preflight proceeds) but must not be silent:
// failures are counted per provider and logged at most once per interval.
const FAILURE_LOG_INTERVAL_MS = 60_000;

interface FetcherFailureState {
  count: number;
  lastError: string;
  lastFailedAt: number;
  lastLoggedAt: number;
}

const fetcherFailures = new Map<string, FetcherFailureState>();

function recordQuotaFetcherFailure(provider: string, detail: string): void {
  const now = Date.now();
  const state = fetcherFailures.get(provider) ?? {
    count: 0,
    lastError: "",
    lastFailedAt: 0,
    lastLoggedAt: 0,
  };
  state.count++;
  state.lastError = detail;
  state.lastFailedAt = now;
  if (now - state.lastLoggedAt >= FAILURE_LOG_INTERVAL_MS) {
    state.lastLoggedAt = now;
    console.warn(
      `[QuotaPreflight] ${provider}: quota fetcher failed (${state.count} failure(s) so far) — ${detail}`
    );
  }
  fetcherFailures.set(provider, state);
}

/** Per-provider quota fetcher failure counters (for dashboards/monitoring). */
export function getStats(): Record<
  string,
  { failures: number; lastError: string; lastFailedAt: number }
> {
  return Object.fromEntries(
    [...fetcherFailures.entries()].map(([provider, state]) => [
      provider,
      { failures: state.count, lastError: state.lastError, lastFailedAt: state.lastFailedAt },
    ])
  );
}

export function isQuotaPreflightEnabled(connection: Record<string, unknown>): boolean {
  const psd = connection?.providerSpecificData as Record<string, unknown> | undefined;
  return psd?.quotaPreflightEnabled === true;
}

export async function preflightQuota(
  provider: string,
  connectionId: string,
  connection: Record<string, unknown>
): Promise<PreflightQuotaResult> {
  if (!isQuotaPreflightEnabled(connection)) {
    return { proceed: true };
  }

  const fetcher = quotaFetcherRegistry.get(provider);
  if (!fetcher) {
    return { proceed: true };
  }

  let quota: QuotaInfo | null = null;
  try {
    quota = await fetcher(connectionId);
  } catch (err) {
    recordQuotaFetcherFailure(provider, err instanceof Error ? err.message : String(err));
    return { proceed: true };
  }

  if (!quota) {
    // A null result is a soft failure — the fetcher ran but produced nothing.
    recordQuotaFetcherFailure(provider, "fetcher returned no data");
    return { proceed: true };
  }


  const { percentUsed } = quota;

  if (percentUsed >= EXHAUSTION_THRESHOLD) {
    console.info(
      `[QuotaPreflight] ${provider}/${connectionId}: ${(percentUsed * 100).toFixed(1)}% used — switching`
    );
    return { proceed: false, reason: "quota_exhausted", quotaPercent: percentUsed };
  }

  if (percentUsed >= WARN_THRESHOLD) {
    console.warn(
      `[QuotaPreflight] ${provider}/${connectionId}: ${(percentUsed * 100).toFixed(1)}% used — approaching limit`
    );
  }

  return { proceed: true, quotaPercent: percentUsed };
}
