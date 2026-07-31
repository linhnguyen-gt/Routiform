import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { FREE_TIER_CATALOG, summarizeFreeTierCatalog, listFreeTierCatalog } =
  await import("../../src/shared/constants/freeTierCatalog.ts");

function loadProviderIds() {
  const dir = path.join(process.cwd(), "src/shared/constants/providers");
  const ids = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const c = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of c.matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(m[1]);
  }
  return ids;
}

test("free tier catalog is non-empty and summarized", () => {
  assert.ok(FREE_TIER_CATALOG.length >= 10);
  const s = summarizeFreeTierCatalog();
  assert.equal(s.total, FREE_TIER_CATALOG.length);
  assert.ok(s.forever >= 1);
  assert.deepEqual(listFreeTierCatalog(), FREE_TIER_CATALOG);
});

test("every free-tier entry maps to a registered provider id", () => {
  const ids = loadProviderIds();
  for (const e of FREE_TIER_CATALOG) {
    assert.ok(ids.has(e.providerId), `missing provider registration: ${e.providerId}`);
  }
});

test("token totals are reported per grant kind, never as one cross-kind figure", () => {
  const summary = summarizeFreeTierCatalog();

  // A daily allowance, a one-off signup credit and a recurring monthly grant are different
  // things; a single "known monthly tokens" number counted one-time credits as if they renewed.
  assert.ok(summary.tokensByKind, "summary must expose per-kind buckets");
  assert.equal(
    "approxKnownMonthlyTokens" in summary,
    false,
    "the cross-kind total must be gone, not merely unused"
  );

  const kinds = Object.keys(summary.tokensByKind).sort();
  assert.deepEqual(kinds, ["daily", "forever", "oauth-sub", "rate-limited", "signup-credit"]);

  for (const [kind, tokens] of Object.entries(summary.tokensByKind)) {
    assert.ok(Number.isFinite(tokens) && tokens >= 0, `${kind} bucket must be a number`);
  }

  const entriesWithTokens = listFreeTierCatalog().filter(
    (e) => typeof e.approxTokensPerMonth === "number"
  ).length;
  assert.equal(summary.entriesWithKnownTokens, entriesWithTokens);
});
