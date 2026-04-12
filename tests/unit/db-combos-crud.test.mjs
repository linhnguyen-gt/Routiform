import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combos-crud-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const combosDb = await import("../../src/lib/db/combos.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

async function makeCombo(name) {
  return combosDb.createCombo({
    name,
    models: [{ provider: "openai", model: "gpt-4o" }],
    strategy: "priority",
    config: {},
  });
}

// ─── sort_order defaults ──────────────────────────────────────────────────────

test("getCombos returns combos ordered by sort_order ASC then name ASC", async () => {
  const _c1 = await makeCombo("zebra");
  const _c2 = await makeCombo("alpha");
  const _c3 = await makeCombo("mango");

  // No reorder yet — sort_order is 0 for all, so falls back to name ASC
  const all = await combosDb.getCombos();
  assert.equal(all.length, 3);
  assert.equal(all[0].name, "alpha");
  assert.equal(all[1].name, "mango");
  assert.equal(all[2].name, "zebra");
});

// ─── reorderCombos ───────────────────────────────────────────────────────────

test("reorderCombos assigns sequential sort_order and persists across reads", async () => {
  const c1 = await makeCombo("first");
  const c2 = await makeCombo("second");
  const c3 = await makeCombo("third");

  // Reverse order
  const updated = await combosDb.reorderCombos([c3.id, c1.id, c2.id]);
  assert.equal(updated, 3);

  const all = await combosDb.getCombos();
  assert.equal(all[0].name, "third");
  assert.equal(all[1].name, "first");
  assert.equal(all[2].name, "second");
});

test("reorderCombos is atomic — partial list leaves unmentioned rows with old sort_order", async () => {
  const c1 = await makeCombo("alpha");
  const c2 = await makeCombo("beta");
  const _c3 = await makeCombo("gamma");

  // Only reorder two of the three
  await combosDb.reorderCombos([c2.id, c1.id]);

  // beta=1, alpha=2; gamma still has sort_order=0 → sorts first alphabetically among sort_order=0
  const all = await combosDb.getCombos();
  assert.ok(all.length === 3);
  // gamma (sort_order=0) sorts before beta (sort_order=1) and alpha (sort_order=2)
  assert.equal(all[0].name, "gamma");
  assert.equal(all[1].name, "beta");
  assert.equal(all[2].name, "alpha");
});

test("reorderCombos returns 0 for unknown ids without throwing", async () => {
  await makeCombo("solo");
  const updated = await combosDb.reorderCombos(["non-existent-uuid-0000-0000-000000000000"]);
  assert.equal(updated, 0);
});

test("reorderCombos with single element sets sort_order=1", async () => {
  const c1 = await makeCombo("only");
  const updated = await combosDb.reorderCombos([c1.id]);
  assert.equal(updated, 1);

  const all = await combosDb.getCombos();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "only");
});

// ─── sort_order survives updateCombo ─────────────────────────────────────────

test("sort_order is preserved after updateCombo", async () => {
  const c1 = await makeCombo("aaa");
  const c2 = await makeCombo("bbb");

  await combosDb.reorderCombos([c2.id, c1.id]);

  // Update c2's name — sort_order should remain 1
  await combosDb.updateCombo(c2.id, { name: "bbb-updated" });

  const all = await combosDb.getCombos();
  assert.equal(all[0].name, "bbb-updated");
  assert.equal(all[1].name, "aaa");
});

// ─── ID validation ───────────────────────────────────────────────────────────

test("reorderCombos filters out invalid IDs and only updates valid ones", async () => {
  const c1 = await makeCombo("valid-1");
  const c2 = await makeCombo("valid-2");

  const updated = await combosDb.reorderCombos(["invalid-uuid-1", c2.id, "invalid-uuid-2", c1.id]);

  // Only 2 valid IDs updated
  assert.equal(updated, 2);

  const all = await combosDb.getCombos();
  assert.equal(all[0].name, "valid-2");
  assert.equal(all[1].name, "valid-1");
});
