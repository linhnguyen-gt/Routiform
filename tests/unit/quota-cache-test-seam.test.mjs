import test from "node:test";
import assert from "node:assert/strict";

// The quota cache is a module-level Map with no reset and a write path that always persists a
// snapshot row. Any test that seeds it therefore leaks state into the next test file and writes
// to the real quota_snapshots table, which makes ordering goldens non-reproducible.
// These tests pin the seam that makes seeding safe.

const { setQuotaCache, getQuotaCache, clearQuotaCache, getQuotaCacheStats } =
  await import("../../src/domain/quotaCache.ts");
const { getQuotaSnapshots } = await import("../../src/lib/db/quotaSnapshots.ts");

const SINCE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function snapshotCountFor(connectionId) {
  return getQuotaSnapshots({ connectionId, since: SINCE }).length;
}

test("clearQuotaCache empties the cache", () => {
  setQuotaCache("seam-conn-clear", "openai", {
    daily: { total: 100, used: 20, resetAt: null },
  });
  assert.ok(getQuotaCache("seam-conn-clear"), "entry should exist after seeding");

  clearQuotaCache();

  assert.equal(getQuotaCache("seam-conn-clear"), null, "entry should be gone after clear");
  assert.equal(getQuotaCacheStats().total, 0, "stats should report an empty cache");
});

test("a non-persisting write leaves zero rows in quota_snapshots", () => {
  const connectionId = `seam-conn-nopersist-${process.pid}`;
  const before = snapshotCountFor(connectionId);

  setQuotaCache(
    connectionId,
    "openai",
    { daily: { total: 100, used: 20, resetAt: null } },
    { persist: false }
  );

  assert.ok(getQuotaCache(connectionId), "the in-memory entry is still written");
  assert.equal(
    snapshotCountFor(connectionId),
    before,
    "persist:false must not write a quota_snapshots row"
  );

  clearQuotaCache();
});

test("the default write path still persists, so production behaviour is unchanged", () => {
  const connectionId = `seam-conn-persist-${process.pid}`;
  const before = snapshotCountFor(connectionId);

  setQuotaCache(connectionId, "openai", {
    daily: { total: 100, used: 20, resetAt: null },
  });

  assert.ok(
    snapshotCountFor(connectionId) > before,
    "omitting the option must keep persisting, or production loses its snapshot history"
  );

  clearQuotaCache();
});

test("seeding then clearing leaves no residue for the next test file", () => {
  const connectionId = `seam-conn-residue-${process.pid}`;
  setQuotaCache(
    connectionId,
    "anthropic",
    { daily: { total: 100, used: 90, resetAt: null } },
    { persist: false }
  );
  clearQuotaCache();

  assert.equal(getQuotaCache(connectionId), null);
  assert.equal(getQuotaCacheStats().total, 0);
});
