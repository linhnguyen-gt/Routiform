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
