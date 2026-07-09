import test from "node:test";
import assert from "node:assert/strict";

const { orderModelsByLkgp, orderModelsByHeadroom, orderModelsByP2c } =
  await import("../../open-sse/services/combo/combo-strategy-orderers.ts");

const { recordComboRequest, getComboMetrics, resetComboMetrics } =
  await import("../../open-sse/services/comboMetrics.ts").catch(async () => {
    // Some exports may differ; load module and inspect
    const m = await import("../../open-sse/services/comboMetrics.ts");
    return m;
  });

test("fill-first semantics: orderModelsByLkgp is identity without provider", () => {
  const models = ["a/m1", "b/m2", "c/m3"];
  assert.deepEqual(orderModelsByLkgp(models, null), models);
  assert.deepEqual(orderModelsByLkgp(models, ""), models);
});

test("lkgp promotes matching provider to front", () => {
  const models = ["openai/gpt-4o", "anthropic/claude", "groq/llama"];
  const ordered = orderModelsByLkgp(models, "anthropic");
  assert.equal(ordered[0], "anthropic/claude");
  assert.equal(ordered.length, 3);
  assert.ok(ordered.includes("openai/gpt-4o"));
});

test("headroom ranks lowest load first", () => {
  // Seed metrics if API available
  const combo = "test-headroom-combo";
  if (typeof resetComboMetrics === "function") {
    try {
      resetComboMetrics(combo);
    } catch {
      /* ignore */
    }
  }
  if (typeof recordComboRequest === "function") {
    try {
      recordComboRequest(combo, "p/high", { success: true, latencyMs: 10 });
      recordComboRequest(combo, "p/high", { success: true, latencyMs: 10 });
      recordComboRequest(combo, "p/high", { success: true, latencyMs: 10 });
      recordComboRequest(combo, "p/low", { success: true, latencyMs: 10 });
    } catch {
      /* ignore */
    }
  }
  const models = ["p/high", "p/low", "p/zero"];
  const ordered = orderModelsByHeadroom(models, combo);
  // p/zero or p/low should beat p/high
  assert.notEqual(ordered[0], "p/high");
  assert.ok(ordered.includes("p/high"));
});

test("p2c returns all models with pick first", () => {
  const models = ["a/1", "b/2", "c/3"];
  const ordered = orderModelsByP2c(models, "p2c-combo");
  assert.equal(ordered.length, 3);
  assert.equal(new Set(ordered).size, 3);
});
