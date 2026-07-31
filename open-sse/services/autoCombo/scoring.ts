/**
 * Auto-Combo Scoring Function
 *
 * Calculates a weighted score for each provider candidate based on 6 factors:
 *   1. Quota        (0.20) — residual capacity [0..1]
 *   2. Health       (0.25) — circuit breaker state
 *   3. CostInv      (0.20) — inverse cost normalized to pool
 *   4. LatencyInv   (0.15) — inverse p95 latency normalized to pool
 *   5. TaskFit      (0.10) — model × taskType fitness score
 *   6. Stability    (0.10) — variance-based prediction of consistency
 */

export interface ScoringFactors {
  quota: number;
  health: number;
  costInv: number;
  latencyInv: number;
  taskFit: number;
  stability: number;
  tierPriority: number; // T10: Ultra > Pro > Free account tier boost
}

export interface ScoringWeights {
  quota: number;
  health: number;
  costInv: number;
  latencyInv: number;
  taskFit: number;
  stability: number;
  tierPriority: number; // T10
}

// T10: Rebalanced — stability 0.10→0.05, tierPriority 0.05 added. Sum = 1.0.
export const DEFAULT_WEIGHTS: ScoringWeights = {
  quota: 0.2,
  health: 0.25,
  costInv: 0.2,
  latencyInv: 0.15,
  taskFit: 0.1,
  stability: 0.05,
  tierPriority: 0.05,
};

export interface ProviderCandidate {
  provider: string;
  model: string;
  quotaRemaining: number; // percentage 0..100
  quotaTotal: number;
  circuitBreakerState: "CLOSED" | "HALF_OPEN" | "OPEN";
  costPer1MTokens: number;
  p95LatencyMs: number;
  latencyStdDev: number;
  errorRate: number;
  /** T10: Optional account tier for priority boosting (Ultra > Pro > Free) */
  accountTier?: "ultra" | "pro" | "standard" | "free";
  /** T10: Optional quota reset interval in seconds (shorter = higher priority when same quota) */
  quotaResetIntervalSecs?: number;
  /**
   * Whether `quotaRemaining` came from a real cache entry. False means the value is a placeholder,
   * so consumers can zero the quota weight rather than rank on a constant.
   */
  quotaDataAvailable?: boolean;
  /** Eligible connections behind the aggregated quota; 1 account at 80% is not 5 accounts at 80%. */
  quotaConnectionCount?: number;
}

export interface ScoredProvider {
  provider: string;
  model: string;
  score: number;
  factors: ScoringFactors;
}

/**
 * Calculate weighted score from factors.
 */
export function calculateScore(factors: ScoringFactors, weights: ScoringWeights): number {
  return (
    weights.quota * factors.quota +
    weights.health * factors.health +
    weights.costInv * factors.costInv +
    weights.latencyInv * factors.latencyInv +
    weights.taskFit * factors.taskFit +
    weights.stability * factors.stability +
    weights.tierPriority * factors.tierPriority
  );
}

/**
 * T10: Convert account tier string to a normalized score [0..1].
 * Ultra = 1.0 (most quota, fastest reset)
 * Pro   = 0.67
 * Standard = 0.33
 * Free  = 0.0
 * Accounts with faster reset cycles (shorter quotaResetIntervalSecs) also get
 * a small adjustment: monthly accounts are penalized vs. daily accounts.
 */
export function calculateTierScore(
  tier: string | undefined,
  quotaResetIntervalSecs: number | undefined
): number {
  const BASE_TIER_SCORES: Record<string, number> = {
    ultra: 1.0,
    pro: 0.67,
    standard: 0.33,
    free: 0.0,
  };
  const baseScore = BASE_TIER_SCORES[tier?.toLowerCase() ?? ""] ?? 0.33; // unknown defaults to standard

  // Bonus for faster reset intervals (daily quota > weekly > monthly)
  // maxInterval ~ 30 days (2_592_000s). Normalize: [0..1] where 0=monthly, 1=per-minute
  const resetBonus =
    quotaResetIntervalSecs != null && quotaResetIntervalSecs > 0
      ? Math.max(0, 1 - quotaResetIntervalSecs / 2_592_000)
      : 0;

  // Blend: 80% tier level, 20% reset frequency
  return Math.min(1, baseScore * 0.8 + resetBonus * 0.2);
}

/**
 * Calculate individual factors for a provider within its pool.
 */
export function calculateFactors(
  candidate: ProviderCandidate,
  pool: ProviderCandidate[],
  taskType: string,
  getTaskFitness: (model: string, taskType: string) => number
): ScoringFactors {
  // Pool-wide maximums for normalization
  const maxCost = Math.max(...pool.map((p) => p.costPer1MTokens), 0.001);
  const maxLatency = Math.max(...pool.map((p) => p.p95LatencyMs), 1);
  const maxStdDev = Math.max(...pool.map((p) => p.latencyStdDev), 0.001);

  return {
    quota: Math.min(1, candidate.quotaRemaining / 100),
    health:
      candidate.circuitBreakerState === "CLOSED"
        ? 1.0
        : candidate.circuitBreakerState === "HALF_OPEN"
          ? 0.5
          : 0.0,
    costInv: 1 - candidate.costPer1MTokens / maxCost,
    latencyInv: 1 - candidate.p95LatencyMs / maxLatency,
    taskFit: getTaskFitness(candidate.model, taskType),
    stability: 1 - candidate.latencyStdDev / maxStdDev,
    tierPriority: calculateTierScore(candidate.accountTier, candidate.quotaResetIntervalSecs),
  };
}

/**
 * Score and rank all providers in a pool.
 */
export function scorePool(
  pool: ProviderCandidate[],
  taskType: string,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  getTaskFitness: (model: string, taskType: string) => number = () => 0.5
): ScoredProvider[] {
  return pool
    .map((candidate) => {
      const factors = calculateFactors(candidate, pool, taskType, getTaskFitness);
      return {
        provider: candidate.provider,
        model: candidate.model,
        score: calculateScore(factors, weights),
        factors,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Validate that weights sum to 1.0 (±0.01 tolerance).
 */
export function validateWeights(weights: ScoringWeights): boolean {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) < 0.01;
}
