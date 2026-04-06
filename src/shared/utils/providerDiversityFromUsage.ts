/**
 * Normalized Shannon entropy (0–1) over provider request shares from usage analytics `byProvider`.
 * Matches the "Diversity (usage-based)" KPI in UsageAnalytics.
 */
export function computeNormalizedEntropyFromByProvider(
  byProvider:
    | Array<{
        provider?: string;
        requests?: number;
        totalRequests?: number;
        apiCalls?: number;
      }>
    | null
    | undefined
): {
  score01: number;
  providers: Record<string, { share: number }>;
  totalRequests: number;
} {
  const rows = byProvider || [];

  let totalCalls = 0;
  for (const p of rows) {
    totalCalls += p.requests ?? p.totalRequests ?? p.apiCalls ?? 0;
  }
  if (totalCalls === 0) {
    return { score01: 0, providers: {}, totalRequests: 0 };
  }

  const withTraffic = rows.filter((p) => (p.requests ?? p.totalRequests ?? p.apiCalls ?? 0) > 0);
  if (withTraffic.length === 0) {
    return { score01: 0, providers: {}, totalRequests: 0 };
  }

  if (withTraffic.length === 1) {
    const name = withTraffic[0].provider || "unknown";
    return {
      score01: 0,
      providers: { [name]: { share: 1 } },
      totalRequests: totalCalls,
    };
  }

  let h = 0;
  for (const p of withTraffic) {
    const c = p.requests ?? p.totalRequests ?? p.apiCalls ?? 0;
    const pi = c / totalCalls;
    if (pi > 0) h -= pi * Math.log2(pi);
  }
  const maxH = Math.log2(withTraffic.length);
  const score01 = maxH > 0 ? h / maxH : 0;

  const providers: Record<string, { share: number }> = {};
  for (const p of withTraffic) {
    const c = p.requests ?? p.totalRequests ?? p.apiCalls ?? 0;
    const name = p.provider || "unknown";
    providers[name] = { share: c / totalCalls };
  }

  return { score01, providers, totalRequests: totalCalls };
}
