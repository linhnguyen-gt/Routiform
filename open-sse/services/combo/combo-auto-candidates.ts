import type { ProviderCandidate } from "../autoCombo/scoring.ts";
import { parseModel } from "../model.ts";
import { getComboMetrics } from "../comboMetrics.ts";
import { getCircuitBreaker } from "../../../src/shared/utils/circuitBreaker";
import { isAccountUnavailable } from "../accountFallback.ts";
import { DEFAULT_MODEL_P95_MS, MIN_HISTORY_SAMPLES } from "./combo-constants.ts";
import {
  aggregateConnectionQuota,
  filterEligibleConnections,
  DEFAULT_CANDIDATE_QUOTA,
  type CandidateQuota,
} from "./combo-candidate-quota.ts";

function getBootstrapLatencyMs(modelId: string): number {
  const normalized = String(modelId || "").toLowerCase();
  return DEFAULT_MODEL_P95_MS[normalized] ?? 1500;
}

/**
 * Resolve quota once per distinct provider — several candidate models usually share one provider,
 * and connections are a per-provider property. Reads come from the in-memory quota cache; the
 * snapshot table is for durability, never for the routing hot path.
 */
async function resolveQuotaByProvider(providers: string[]): Promise<Map<string, CandidateQuota>> {
  const byProvider = new Map<string, CandidateQuota>();
  const distinct = [...new Set(providers)];
  if (distinct.length === 0) return byProvider;

  let getProviderConnections: (filter: Record<string, unknown>) => Promise<unknown[]>;
  try {
    ({ getProviderConnections } = await import("../../../src/lib/localDb"));
  } catch {
    // No DB in this context: every candidate keeps placeholder quota, flagged as unavailable.
    for (const provider of distinct) byProvider.set(provider, { ...DEFAULT_CANDIDATE_QUOTA });
    return byProvider;
  }

  await Promise.all(
    distinct.map(async (provider) => {
      try {
        const rows = (await getProviderConnections({ provider, isActive: true })) as Array<{
          id: string;
          testStatus?: string | null;
          rateLimitedUntil?: string | null;
        }>;
        const eligible = filterEligibleConnections(rows ?? [], isAccountUnavailable);
        byProvider.set(provider, aggregateConnectionQuota(eligible));
      } catch {
        byProvider.set(provider, { ...DEFAULT_CANDIDATE_QUOTA });
      }
    })
  );

  return byProvider;
}

export async function buildAutoCandidates(
  modelStrings: string[],
  comboName: string
): Promise<ProviderCandidate[]> {
  const metrics = getComboMetrics(comboName);
  const { getPricingForModel } = await import("../../../src/lib/localDb");
  let historicalLatencyStats: Record<string, unknown> = {};
  try {
    const { getModelLatencyStats } = await import("../../../src/lib/usageDb");
    historicalLatencyStats = await getModelLatencyStats({
      windowHours: 24,
      minSamples: 3,
      maxRows: 10000,
    });
  } catch {
    /* keep empty stats */
  }

  const quotaByProvider = await resolveQuotaByProvider(
    modelStrings.map((modelStr) => {
      const parsed = parseModel(modelStr);
      return parsed.provider || parsed.providerAlias || "unknown";
    })
  );

  const candidates = await Promise.all(
    modelStrings.map(async (modelStr) => {
      const parsed = parseModel(modelStr);
      const provider = parsed.provider || parsed.providerAlias || "unknown";
      const model = parsed.model || modelStr;
      const historicalKey = `${provider}/${model}`;
      const historicalModelMetric =
        (historicalLatencyStats as Record<string, Record<string, unknown>>)[historicalKey] || null;
      const historicalTotal = Number(historicalModelMetric?.totalRequests);
      const hasHistoricalSignal =
        Number.isFinite(historicalTotal) && historicalTotal >= MIN_HISTORY_SAMPLES;

      let costPer1MTokens = 1;
      try {
        const pricing = await getPricingForModel(provider, model);
        const inputPrice = Number(pricing?.input);
        if (Number.isFinite(inputPrice) && inputPrice >= 0) {
          costPer1MTokens = inputPrice;
        }
      } catch {
        /* keep default cost */
      }

      const modelMetric = metrics?.byModel?.[modelStr] || null;
      const avgLatency = Number(modelMetric?.avgLatencyMs);
      const successRate = Number(modelMetric?.successRate);
      const historicalP95Latency = Number(historicalModelMetric?.p95LatencyMs);
      const historicalStdDev = Number(historicalModelMetric?.latencyStdDev);
      const historicalSuccessRate = Number(historicalModelMetric?.successRate);

      const p95LatencyMs = hasHistoricalSignal
        ? Number.isFinite(historicalP95Latency) && historicalP95Latency > 0
          ? historicalP95Latency
          : getBootstrapLatencyMs(model)
        : Number.isFinite(avgLatency) && avgLatency > 0
          ? avgLatency
          : getBootstrapLatencyMs(model);

      const errorRate = hasHistoricalSignal
        ? Number.isFinite(historicalSuccessRate) &&
          historicalSuccessRate >= 0 &&
          historicalSuccessRate <= 1
          ? 1 - historicalSuccessRate
          : 0.05
        : Number.isFinite(successRate) && successRate >= 0 && successRate <= 100
          ? 1 - successRate / 100
          : 0.05;
      const latencyStdDev =
        hasHistoricalSignal && Number.isFinite(historicalStdDev) && historicalStdDev > 0
          ? Math.max(10, historicalStdDev)
          : Math.max(10, p95LatencyMs * 0.1);

      const breakerStateRaw = getCircuitBreaker(`combo:${modelStr}`)?.getStatus?.()?.state;
      const circuitBreakerState: "CLOSED" | "HALF_OPEN" | "OPEN" =
        breakerStateRaw === "OPEN" || breakerStateRaw === "HALF_OPEN" ? breakerStateRaw : "CLOSED";

      const quota = quotaByProvider.get(provider) ?? { ...DEFAULT_CANDIDATE_QUOTA };

      return {
        provider,
        model,
        quotaRemaining: quota.quotaRemaining,
        quotaTotal: quota.quotaTotal,
        quotaDataAvailable: quota.quotaDataAvailable,
        quotaConnectionCount: quota.quotaConnectionCount,
        circuitBreakerState,
        costPer1MTokens,
        p95LatencyMs,
        latencyStdDev,
        errorRate,
        // No connection field carries a subscription tier, so this stays the neutral default and
        // the tier factor contributes nothing until a real source exists.
        accountTier: "standard" as const,
        ...(quota.quotaResetIntervalSecs != null
          ? { quotaResetIntervalSecs: quota.quotaResetIntervalSecs }
          : {}),
      };
    })
  );

  return candidates;
}
