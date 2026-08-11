/**
 * Characterization tests for `handleRoundRobinCombo`.
 *
 * Pins the rotation, the breaker interaction, one known-broken fairness case,
 * and the point at which the concurrency slot is released.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-rr-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { handleRoundRobinCombo } =
  await import("../../open-sse/services/combo/combo-round-robin.ts");
const { getComboMetrics } = await import("../../open-sse/services/comboMetrics.ts");
const core = await import("../../src/lib/db/core.ts");
const { makeScriptedHandler, makeLog, openBreaker, resetComboGlobals, semaphore } =
  await import("../helpers/combo-chain-harness.mjs");

const A = "groq/model-alpha";
const B = "cerebras/model-beta";
const C = "fireworks/model-gamma";
/** Denylisted for tool calling, so `requireToolCalling` drops it. */
const NO_TOOLS = "groq/deepseek-reasoner";

function rrOptions(handler, combo, overrides = {}) {
  return {
    body: {},
    combo: { config: { maxRetries: 0, retryDelayMs: 0 }, ...combo },
    handleSingleModel: handler,
    log: makeLog(),
    ...overrides,
  };
}

/** Count how many times each model was the FIRST attempt of its request. */
function firstAttemptPerRequest(handler, requestBoundaries) {
  return requestBoundaries.map((start) => handler.attempts[start]?.modelStr);
}

/**
 * Read the body so the response's concurrency slot is returned.
 *
 * A successful combo response now holds its slot until its body drains, which
 * is the point of the phase-03 fix — a caller that keeps a response and never
 * reads it keeps the slot too.
 */
async function drain(res) {
  await res.text();
  await new Promise((r) => setTimeout(r, 0));
  return res;
}

test.beforeEach(() => resetComboGlobals());

test.afterEach(() => {
  // Every test here depends on remembering `drain()`. A forgotten one leaks a
  // concurrency slot, which `beforeEach` would silently clear — fail it here.
  for (const [model, gate] of Object.entries(semaphore.getStats())) {
    assert.equal(gate.running, 0, `slot leaked on ${model}`);
    assert.equal(gate.queued, 0, `waiter left queued on ${model}`);
  }
});

test.after(() => {
  resetComboGlobals();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("3 models, 6 successful requests: each model serves exactly 2", async () => {
  const handler = makeScriptedHandler({ "*": "ok" });
  const combo = { name: "rr-even", models: [A, B, C] };

  for (let i = 0; i < 6; i++) {
    const res = await drain(await handleRoundRobinCombo(rrOptions(handler, combo)));
    assert.equal(res.status, 200);
  }

  const counts = {};
  for (const { modelStr } of handler.attempts) counts[modelStr] = (counts[modelStr] ?? 0) + 1;
  assert.deepEqual(counts, { [A]: 2, [B]: 2, [C]: 2 });
});

test("the starting offset advances by one per request", async () => {
  const handler = makeScriptedHandler({ "*": "ok" });
  const combo = { name: "rr-offset", models: [A, B, C] };

  for (let i = 0; i < 4; i++) {
    await drain(await handleRoundRobinCombo(rrOptions(handler, combo)));
  }

  assert.deepEqual(firstAttemptPerRequest(handler, [0, 1, 2, 3]), [A, B, C, A]);
});

test("a model with an open breaker is skipped and the next offset serves the request", async () => {
  openBreaker(B);
  const handler = makeScriptedHandler({ "*": "ok" });
  const combo = { name: "rr-breaker", models: [A, B, C] };
  const options = rrOptions(handler, combo);

  // counter 0 → A, counter 1 → B (skipped) → C
  await drain(await handleRoundRobinCombo(options));
  const second = rrOptions(handler, combo);
  const res = await drain(await handleRoundRobinCombo(second));

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [A, C]);
  assert.ok(second.log.find(/circuit breaker OPEN/), "skip should be logged");
});

test("TODO(deferred-§3-H4): requireToolCalling skews the rotation", async () => {
  // The round-robin counter is shared across requests, but the model list it
  // indexes into shrinks when a tool-carrying request filters out a model that
  // cannot tool-call. The same counter therefore addresses two different lists,
  // and the distribution collapses onto whichever model both lists share at the
  // surviving offsets. Not fixed in this plan — see
  // `plans/260810-1739-combo-routing-resilience/deferred-findings.md` §3 (H4).
  const handler = makeScriptedHandler({ "*": "ok" });
  const combo = {
    name: "rr-tools-skew",
    models: [A, NO_TOOLS, C],
    requireToolCalling: true,
  };

  for (let i = 0; i < 6; i++) {
    const withTools = i % 2 === 1;
    await drain(
      await handleRoundRobinCombo(
        rrOptions(handler, combo, { body: withTools ? { tools: [{ type: "function" }] } : {} })
      )
    );
  }

  const counts = {};
  for (const { modelStr } of handler.attempts) counts[modelStr] = (counts[modelStr] ?? 0) + 1;
  assert.deepEqual(counts, { [A]: 1, [NO_TOOLS]: 1, [C]: 4 });
});

test("round-robin fallbackCount counts attempts, not skips", async () => {
  openBreaker(B);
  const handler = makeScriptedHandler({ [A]: 500, [C]: "ok" });
  const combo = { name: "rr-fallback-count", models: [A, B, C] };
  const options = rrOptions(handler, combo);
  const res = await drain(await handleRoundRobinCombo(options));

  assert.equal(res.status, 200);
  // A was attempted and failed, B was skipped by the breaker, C served it.
  assert.deepEqual(handler.order(), [A, C]);
  assert.equal(getComboMetrics(combo.name)?.totalFallbacks, 1);
});

test("a streaming response holds its concurrency slot past the headers", async () => {
  let streamController;
  const handler = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          streamController = controller;
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );

  const combo = { name: "rr-stream", models: [A] };
  const res = await handleRoundRobinCombo(rrOptions(handler, combo, { body: { stream: true } }));

  assert.equal(res.status, 200);
  assert.equal(semaphore.getStats()[A]?.running ?? 0, 1);

  streamController.close();
  await res.body.cancel().catch(() => {});
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(semaphore.getStats()[A]?.running ?? 0, 0);
});
