import test from "node:test";
import assert from "node:assert/strict";

// buildAutoCandidates hardcoded quotaRemaining/quotaTotal/accountTier/quotaResetIntervalSecs, so
// the quota factor (weight .20) and tier factor (.05) were the same constant for every candidate:
// 25% of the auto-combo score carried no information. These tests pin the aggregation that
// replaces the constants.

const { setQuotaCache, clearQuotaCache } = await import("../../src/domain/quotaCache.ts");
const {
  aggregateConnectionQuota,
  filterEligibleConnections,
  parseWindowIntervalSecs,
  DEFAULT_CANDIDATE_QUOTA,
} = await import("../../open-sse/services/combo/combo-candidate-quota.ts");
const { scorePool, DEFAULT_WEIGHTS } = await import("../../open-sse/services/autoCombo/scoring.ts");

function seed(connectionId, windows, { provider = "openai" } = {}) {
  setQuotaCache(connectionId, provider, windows, { persist: false });
}

test.afterEach(() => clearQuotaCache());

test("candidate quota reflects the seeded cache entry", () => {
  seed("hydrate-a", { daily: { total: 100, used: 58, resetAt: null } });

  const quota = aggregateConnectionQuota([{ id: "hydrate-a" }]);

  assert.equal(quota.quotaRemaining, 42);
  assert.equal(quota.quotaDataAvailable, true);
  assert.equal(quota.quotaConnectionCount, 1);
});

test("aggregation takes the max across a provider's connections", () => {
  seed("agg-low", { daily: { total: 100, used: 90, resetAt: null } });
  seed("agg-mid", { daily: { total: 100, used: 58, resetAt: null } });
  seed("agg-high", { daily: { total: 100, used: 20, resetAt: null } });

  const quota = aggregateConnectionQuota([
    { id: "agg-low" },
    { id: "agg-mid" },
    { id: "agg-high" },
  ]);

  assert.equal(quota.quotaRemaining, 80, "the selector reaches for the healthiest account");
  assert.equal(quota.quotaConnectionCount, 3);
});

test("within one connection the most binding window wins", () => {
  seed("binding", {
    "session (5h)": { total: 100, used: 5, resetAt: null },
    "weekly (7d)": { total: 100, used: 95, resetAt: null },
  });

  const quota = aggregateConnectionQuota([{ id: "binding" }]);

  assert.equal(quota.quotaRemaining, 5, "a spent weekly window spends the account");
  assert.equal(quota.quotaResetIntervalSecs, 604800, "the binding window's cycle length is used");
});

test("a connection excluded by the eligibility filter is excluded from the aggregation", () => {
  seed("elig-banned", { daily: { total: 100, used: 0, resetAt: null } });
  seed("elig-ok", { daily: { total: 100, used: 70, resetAt: null } });

  const eligible = filterEligibleConnections(
    [
      { id: "elig-banned", testStatus: "banned", rateLimitedUntil: null },
      { id: "elig-ok", testStatus: "ok", rateLimitedUntil: null },
    ],
    () => false
  );
  const quota = aggregateConnectionQuota(eligible);

  assert.deepEqual(
    eligible.map((c) => c.id),
    ["elig-ok"]
  );
  assert.equal(quota.quotaRemaining, 30, "the banned account's full quota must not be counted");
});

test("a rate-limited connection is excluded too", () => {
  const eligible = filterEligibleConnections(
    [{ id: "rl", testStatus: "ok", rateLimitedUntil: "later" }],
    (until) => until === "later"
  );
  assert.deepEqual(eligible, []);
});

test("absent data is marked, not silently defaulted", () => {
  const quota = aggregateConnectionQuota([{ id: "never-seeded" }]);

  assert.equal(quota.quotaDataAvailable, false);
  assert.equal(quota.quotaRemaining, DEFAULT_CANDIDATE_QUOTA.quotaRemaining);
  assert.equal(quota.quotaConnectionCount, 1, "the connection exists, its quota does not");
});

test("a provider with no eligible connections reports zero connections", () => {
  const quota = aggregateConnectionQuota([]);
  assert.equal(quota.quotaDataAvailable, false);
  assert.equal(quota.quotaConnectionCount, 0);
});

test("window keys yield real cycle lengths, and opaque keys yield none", () => {
  assert.equal(parseWindowIntervalSecs("session (5h)"), 5 * 3600);
  assert.equal(parseWindowIntervalSecs("weekly (7d)"), 7 * 86400);
  assert.equal(parseWindowIntervalSecs("weekly sonnet (7d)"), 7 * 86400);
  assert.equal(parseWindowIntervalSecs("Weekly"), 604800);
  assert.equal(parseWindowIntervalSecs("daily"), 86400);

  // Opaque keys must not be given a fabricated interval — the tier factor rewards shorter cycles.
  assert.equal(parseWindowIntervalSecs("session"), null);
  assert.equal(parseWindowIntervalSecs("Ratelimit"), null);
  assert.equal(parseWindowIntervalSecs("gemini-2.5-pro"), null);
  assert.equal(parseWindowIntervalSecs(""), null);
});

test("buildAutoCandidates emits the quota provenance fields instead of hardcoded constants", async () => {
  const { buildAutoCandidates } =
    await import("../../open-sse/services/combo/combo-auto-candidates.ts");

  const candidates = await buildAutoCandidates(["openai/gpt-4o-mini"], "hydration-probe");

  assert.equal(candidates.length, 1);
  const [candidate] = candidates;

  assert.ok(
    Object.prototype.hasOwnProperty.call(candidate, "quotaDataAvailable"),
    "candidate must declare whether its quota is real"
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(candidate, "quotaConnectionCount"),
    "candidate must declare how many accounts back that quota"
  );
  assert.equal(
    candidate.quotaDataAvailable,
    false,
    "with no seeded connection the quota is not real and must say so"
  );
  assert.equal(
    candidate.quotaResetIntervalSecs,
    undefined,
    "no upstream reports a cycle length here, so none may be invented"
  );
});

test("candidates with different quota score differently", () => {
  const base = {
    model: "m",
    circuitBreakerState: "CLOSED",
    costPer1MTokens: 1,
    p95LatencyMs: 500,
    latencyStdDev: 50,
    errorRate: 0.01,
  };
  const scored = scorePool(
    [
      { ...base, provider: "low", quotaRemaining: 10, quotaTotal: 100 },
      { ...base, provider: "high", quotaRemaining: 90, quotaTotal: 100 },
    ],
    "general",
    DEFAULT_WEIGHTS,
    () => 0.5
  );

  const low = scored.find((s) => s.provider === "low");
  const high = scored.find((s) => s.provider === "high");
  assert.ok(high.score > low.score, "quota must move the score, not sit at a constant");
});
