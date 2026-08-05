import { useEffect } from "react";

/**
 * Restores the per-model pass/fail marks from previously recorded requests.
 *
 * Without this the marks live only in React state, so every reload shows a page full of
 * untested models even though the answers were already recorded. Seeding is a plain read —
 * it never calls upstream, so it costs nothing against the account's quota.
 *
 * Results already collected in this session win: a probe running while the fetch is in
 * flight must not be overwritten by the older stored verdict.
 */
export function useProviderDetailModelAvailability({
  providerId,
  keyPrefixes,
  loading,
  setModelTestResults,
}: {
  providerId: string;
  /**
   * `usage_history` stores the bare model id, but `modelTestResults` is keyed by the full
   * "alias/model" string the row renders — and the alias differs per render branch
   * (`providerId` for passthrough, the display alias otherwise). Seeding every prefix is
   * cheaper and less brittle than trying to predict which branch will draw the row.
   */
  keyPrefixes: string[];
  loading: boolean;
  setModelTestResults: (
    fn: (prev: Record<string, "ok" | "error">) => Record<string, "ok" | "error">
  ) => void;
}): void {
  // Effect deps compare by reference, so a fresh array each render would refetch forever.
  const prefixKey = keyPrefixes.filter(Boolean).sort().join("|");

  useEffect(() => {
    if (loading || !providerId) return;
    const prefixes = prefixKey.split("|").filter(Boolean);
    if (prefixes.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/provider-models/availability?provider=${encodeURIComponent(providerId)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          results?: Record<string, { status?: "ok" | "error" }>;
        };
        if (cancelled || !data.results) return;

        const stored: Record<string, "ok" | "error"> = {};
        for (const [modelId, outcome] of Object.entries(data.results)) {
          if (outcome?.status !== "ok" && outcome?.status !== "error") continue;
          for (const prefix of prefixes) {
            stored[`${prefix}/${modelId}`] = outcome.status;
          }
        }
        if (Object.keys(stored).length === 0) return;

        setModelTestResults((prev) => ({ ...stored, ...prev }));
      } catch {
        // Non-critical: the page still works, models just show as untested.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId, prefixKey, loading, setModelTestResults]);
}
