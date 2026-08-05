import test from "node:test";
import assert from "node:assert/strict";

/**
 * The OAuth refresh circuit breaker was keyed by provider name alone, so one dead account tripped
 * it and every other account of that provider was blocked from refreshing for the full 30-minute
 * cooldown. An operator running four Claude connections lost all four because one refresh token
 * was revoked.
 *
 * The key is now provider + connection id, with the bare provider as the fallback when no id is
 * available — degrading to the old behaviour, rather than letting a caller escape the breaker.
 */

const { refreshWithRetry, isProviderBlocked, getCircuitBreakerStatus } =
  await import("../../open-sse/services/tokenRefresh.ts");

const SILENT_LOG = { error: () => {}, warn: () => {}, debug: () => {}, info: () => {} };

/** Exhaust the retries once: `maxRetries: 1` so a failing run costs one attempt, not three. */
async function failOnce(provider, connectionId) {
  return refreshWithRetry(async () => null, 1, SILENT_LOG, provider, connectionId);
}

async function succeedOnce(provider, connectionId) {
  return refreshWithRetry(
    async () => ({ accessToken: "fresh" }),
    1,
    SILENT_LOG,
    provider,
    connectionId
  );
}

async function trip(provider, connectionId) {
  for (let i = 0; i < 5; i += 1) await failOnce(provider, connectionId);
}

test("five exhausted refreshes trip the breaker for that connection", async () => {
  const provider = "claude-trip";
  await trip(provider, "conn-a");

  assert.equal(isProviderBlocked(provider, "conn-a"), true);
});

// The regression this phase exists for: it fails on the pre-change code, where the key is the
// bare provider and connection B inherits A's trip.
test("a sibling connection on the same provider is NOT blocked", async () => {
  const provider = "claude-sibling";
  await trip(provider, "conn-a");

  assert.equal(isProviderBlocked(provider, "conn-a"), true);
  assert.equal(isProviderBlocked(provider, "conn-b"), false);

  const result = await succeedOnce(provider, "conn-b");
  assert.deepEqual(result, { accessToken: "fresh" }, "the healthy sibling must still refresh");
});

test("a blocked connection short-circuits without calling the refresh function", async () => {
  const provider = "claude-shortcircuit";
  await trip(provider, "conn-a");

  let called = false;
  const result = await refreshWithRetry(
    async () => {
      called = true;
      return { accessToken: "fresh" };
    },
    1,
    SILENT_LOG,
    provider,
    "conn-a"
  );

  assert.equal(result, null);
  assert.equal(called, false, "a tripped breaker must not reach the provider at all");
});

test("recordSuccess clears only the connection that succeeded", async () => {
  const provider = "claude-clear";
  // Four failures each: one short of the threshold, so both carry state.
  for (let i = 0; i < 4; i += 1) {
    await failOnce(provider, "conn-a");
    await failOnce(provider, "conn-b");
  }

  const before = getCircuitBreakerStatus();
  assert.equal(before[`${provider}:conn-a`].failures, 4);
  assert.equal(before[`${provider}:conn-b`].failures, 4);

  await succeedOnce(provider, "conn-a");

  const after = getCircuitBreakerStatus();
  assert.equal(after[`${provider}:conn-a`], undefined, "A's counter must be cleared");
  assert.equal(after[`${provider}:conn-b`].failures, 4, "B's counter must survive");
});

test("an absent connection id reproduces the provider-wide behaviour exactly", async () => {
  const provider = "claude-legacy";
  for (let i = 0; i < 5; i += 1) await failOnce(provider, null);

  assert.equal(isProviderBlocked(provider), true);
  assert.equal(isProviderBlocked(provider, null), true);
  assert.equal(isProviderBlocked(provider, undefined), true);

  const status = getCircuitBreakerStatus();
  assert.ok(status[provider], "the bare provider key is the documented fallback");
});

test("an id-less trip does not block an id-carrying connection, and vice versa", async () => {
  const provider = "claude-mixed";
  for (let i = 0; i < 5; i += 1) await failOnce(provider, null);

  assert.equal(isProviderBlocked(provider), true);
  assert.equal(isProviderBlocked(provider, "conn-a"), false);
});

test("the threshold is still 5 and the cooldown still 30 minutes", async () => {
  const provider = "claude-threshold";

  for (let i = 0; i < 4; i += 1) await failOnce(provider, "conn-a");
  assert.equal(isProviderBlocked(provider, "conn-a"), false, "four failures must not trip it");

  await failOnce(provider, "conn-a");
  assert.equal(isProviderBlocked(provider, "conn-a"), true, "the fifth must");

  const entry = getCircuitBreakerStatus()[`${provider}:conn-a`];
  assert.equal(entry.failures, 5);
  assert.equal(entry.blocked, true);
  const thirtyMinutes = 30 * 60 * 1000;
  assert.ok(
    entry.remainingMs > thirtyMinutes - 10_000 && entry.remainingMs <= thirtyMinutes,
    `expected a ~30 minute cooldown, got ${entry.remainingMs}ms`
  );
});

test("the status map keys are provider:connectionId and carry no credential material", async () => {
  const provider = "claude-status";
  await failOnce(provider, "conn-a");

  const status = getCircuitBreakerStatus();
  const key = `${provider}:conn-a`;
  assert.ok(key in status);
  assert.deepEqual(Object.keys(status[key]).sort(), [
    "blocked",
    "blockedUntil",
    "failures",
    "remainingMs",
  ]);
});

test("consecutive failures accumulate across checks, so the threshold is reachable", async () => {
  // The reset branch in isProviderBlocked used to fire for any entry that was not currently
  // blocked, including one that had merely failed a few times — and every refresh checks before it
  // records, so the counter was wiped before the next failure could add to it. The breaker could
  // not trip at all.
  const provider = "claude-accumulate";

  for (let i = 1; i <= 3; i += 1) {
    await failOnce(provider, "conn-a");
    assert.equal(
      getCircuitBreakerStatus()[`${provider}:conn-a`].failures,
      i,
      `failure ${i} must be counted, not reset by the preceding check`
    );
  }
});

test("a tripped connection is reset once its cooldown expires", async (t) => {
  const provider = "claude-cooldown";
  await trip(provider, "conn-a");
  assert.equal(isProviderBlocked(provider, "conn-a"), true);

  const realNow = Date.now;
  Date.now = () => realNow() + 31 * 60 * 1000;
  t.after(() => {
    Date.now = realNow;
  });

  assert.equal(isProviderBlocked(provider, "conn-a"), false, "the cooldown must expire");
  assert.equal(
    getCircuitBreakerStatus()[`${provider}:conn-a`],
    undefined,
    "an expired entry must be cleared, not left at 5 failures"
  );
});
