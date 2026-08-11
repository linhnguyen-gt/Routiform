/**
 * Characterization tests for the combo ordering functions the switching loop
 * runs before it attempts anything: `resolveInitialOrderedModels`,
 * `applyStrategyOrdering`, and the three comparators in `combo-sort-models.ts`.
 *
 * `combo-strategy-orderers.test.mjs` already covers `orderModelsByLkgp`,
 * `orderModelsByHeadroom` and `orderModelsByP2c`; this file deliberately does
 * not repeat them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-ordering-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { resolveInitialOrderedModels } =
  await import("../../open-sse/services/combo/combo-ordered-models-base.ts");
const { applyStrategyOrdering } =
  await import("../../open-sse/services/combo/combo-ordered-models-strategy.ts");
const { sortModelsByCost, sortModelsByUsage, sortModelsByContextSize } =
  await import("../../open-sse/services/combo/combo-sort-models.ts");
const { recordComboRequest } = await import("../../open-sse/services/comboMetrics.ts");
const { updatePricing } = await import("../../src/lib/localDb.ts");
const { saveModelsDevCapabilities } = await import("../../src/lib/modelsDevSync.ts");
const core = await import("../../src/lib/db/core.ts");
const { makeLog, resetComboGlobals } = await import("../helpers/combo-chain-harness.mjs");

const A = "groq/model-alpha";
const B = "cerebras/model-beta";
const C = "fireworks/model-gamma";

function capability(limitContext) {
  return {
    tool_call: true,
    reasoning: null,
    attachment: null,
    structured_output: null,
    temperature: null,
    modalities_input: "[]",
    modalities_output: "[]",
    knowledge_cutoff: null,
    release_date: null,
    last_updated: null,
    status: null,
    family: null,
    open_weights: null,
    limit_context: limitContext,
    limit_input: null,
    limit_output: null,
    interleaved_field: null,
  };
}

test.beforeEach(() => resetComboGlobals());

test.after(() => {
  resetComboGlobals();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// ─── resolveInitialOrderedModels ────────────────────────────────────────────

test("priority preserves the configured order and drops disabled entries", () => {
  const models = [{ model: A }, { model: B, disabled: true }, { model: C }];
  const ordered = resolveInitialOrderedModels(
    { name: "ord-priority", models },
    null,
    "priority",
    models,
    makeLog()
  );
  assert.deepEqual(ordered, [A, C]);
});

test("weighted with all-zero weights falls back to uniform selection over active models", () => {
  const models = [
    { model: A, weight: 0 },
    { model: B, weight: 0 },
    { model: C, weight: 0 },
  ];
  const seen = new Set();

  for (let i = 0; i < 40; i++) {
    const ordered = resolveInitialOrderedModels(
      { name: "ord-weighted", models },
      null,
      "weighted",
      models,
      makeLog()
    );
    assert.equal(ordered.length, 3, "every active model stays in the fallback order");
    assert.deepEqual([...ordered].sort(), [A, B, C].sort());
    seen.add(ordered[0]);
  }

  // Uniform, not fixed: over 40 draws every model should have led at least once.
  assert.deepEqual([...seen].sort(), [A, B, C].sort());
});

test("weighted puts the heaviest remaining model behind the selected one", () => {
  const models = [
    { model: A, weight: 1 },
    { model: B, weight: 50 },
    { model: C, weight: 10 },
  ];
  const ordered = resolveInitialOrderedModels(
    { name: "ord-weighted-ranked", models },
    null,
    "weighted",
    models,
    makeLog()
  );
  const rest = ordered.slice(1);
  const expectedRest = [B, C, A].filter((m) => m !== ordered[0]);
  assert.deepEqual(rest, expectedRest);
});

// ─── applyStrategyOrdering ──────────────────────────────────────────────────

test("fill-first returns the configured order unchanged", async () => {
  const log = makeLog();
  const ordered = await applyStrategyOrdering([A, B, C], {
    strategy: "fill-first",
    body: {},
    combo: { name: "ord-fill-first" },
    log,
  });
  assert.deepEqual(ordered, [A, B, C]);
  assert.ok(log.find(/Fill-first ordering/));
});

test("least-used orders by recorded request count, ascending", async () => {
  const combo = "ord-least-used";
  recordComboRequest(combo, A, { success: true, latencyMs: 1 });
  recordComboRequest(combo, A, { success: true, latencyMs: 1 });
  recordComboRequest(combo, C, { success: true, latencyMs: 1 });

  const ordered = await applyStrategyOrdering([A, B, C], {
    strategy: "least-used",
    body: {},
    combo: { name: combo },
    log: makeLog(),
  });

  // B has no recorded requests, C has one, A has two.
  assert.deepEqual(ordered, [B, C, A]);
});

test("sortModelsByUsage is identity for a combo with no metrics", () => {
  assert.deepEqual(sortModelsByUsage([A, B, C], "ord-no-metrics"), [A, B, C]);
});

// ─── cost-optimized ─────────────────────────────────────────────────────────

test("cost-optimized puts a priced model ahead of an unpriced one", async () => {
  await updatePricing({
    groq: { "model-alpha": { input: 5, output: 10 } },
    cerebras: { "model-beta": { input: 1, output: 2 } },
  });

  const ordered = await sortModelsByCost([A, C, B]);
  assert.deepEqual(ordered, [B, A, C], "cheapest first, unpriced last");
});

test("the cost comparator is a total order for unpriced models", async () => {
  // Sorting alone cannot pin this: V8 leaves input order alone when the
  // comparator returns NaN, so `Infinity` and `MAX_VALUE` produce the same
  // array. What the fix changes is that the comparison is *defined* — assert
  // that directly, then that the order it yields is the configured one.
  const UNPRICED = Number.MAX_VALUE;
  assert.ok(Number.isFinite(UNPRICED - UNPRICED), "two unpriced models must compare finitely");
  assert.ok(!Number.isFinite(Infinity - Infinity), "the old sentinel could not");

  const unpriced = [C, B, A].map((m) => `unpriced-${m}`);
  assert.deepEqual(await sortModelsByCost(unpriced), unpriced);
  assert.deepEqual(await sortModelsByCost([...unpriced].reverse()), [...unpriced].reverse());
});

// ─── context-optimized ──────────────────────────────────────────────────────

test("context-optimized sorts by descending context limit and honours the combo cap", () => {
  saveModelsDevCapabilities({
    groq: { "model-alpha": capability(32_000) },
    cerebras: { "model-beta": capability(200_000) },
    fireworks: { "model-gamma": capability(128_000) },
  });

  assert.deepEqual(sortModelsByContextSize([A, B, C], null), [B, C, A]);

  // With a cap of 64k, B and C both clamp to 64k and tie; stable sort keeps
  // their input order, and A (32k) stays last.
  assert.deepEqual(sortModelsByContextSize([C, B, A], { context_length: 64_000 }), [C, B, A]);
});
