/**
 * Characterization tests for the standard combo switching loop.
 *
 * These assert what `runStandardComboFallbackChain` does TODAY, including the
 * behaviours phases 02 and 03 of `plans/260810-1739-combo-routing-resilience`
 * deliberately invert. Every assertion pinning a known-wrong behaviour carries
 * a `TODO(phase-NN)` marker — an unmarked assertion is a claim the behaviour is
 * correct.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-chain-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { runStandardComboFallbackChain } =
  await import("../../open-sse/services/combo/combo-standard-fallback-chain.ts");
const { getComboMetrics } = await import("../../open-sse/services/comboMetrics.ts");
const core = await import("../../src/lib/db/core.ts");
const { makeScriptedHandler, makeLog, openBreaker, resetComboGlobals } =
  await import("../helpers/combo-chain-harness.mjs");

const M1 = "groq/model-alpha";
const M2 = "cerebras/model-beta";
const M3 = "fireworks/model-gamma";

let comboSeq = 0;

/** Fresh combo name per test so `totalFallbacks` is never carried over. */
function chainOptions(handler, overrides = {}) {
  return {
    orderedModels: [M1, M2],
    combo: { name: `chain-combo-${++comboSeq}` },
    body: {},
    strategy: "priority",
    handleSingleModelWrapped: handler,
    log: makeLog(),
    maxRetries: 0,
    retryDelayMs: 0,
    config: {},
    ...overrides,
  };
}

test.beforeEach(() => resetComboGlobals());

test.after(() => {
  resetComboGlobals();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("single model succeeds: response returned as-is, no fallback", async () => {
  const handler = makeScriptedHandler({ [M1]: "ok" });
  const options = chainOptions(handler, { orderedModels: [M1] });
  const res = await runStandardComboFallbackChain(options);

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M1]);
  const body = await res.json();
  assert.equal(body.choices[0].message.content, "hello");
  assert.equal(getComboMetrics(options.combo.name)?.totalFallbacks, 0);
});

test("429 then success: same model retried, then the next model is attempted", async () => {
  const handler = makeScriptedHandler({ [M1]: 429, [M2]: "ok" });
  const res = await runStandardComboFallbackChain(
    chainOptions(handler, { maxRetries: 1, retryDelayMs: 0 })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M1, M1, M2]);
});

test("terminal 400: chain stops and the second model is never attempted", async () => {
  // 400 is the terminal status here, not 401 — `checkFallbackError` treats 401
  // as fallback-worthy (it cools the connection down and moves on), while a
  // plain 400 that matches no bad-request-fallback pattern ends the chain.
  const handler = makeScriptedHandler({
    [M1]: { status: 400, body: { error: { message: "invalid parameter: temperature" } } },
    [M2]: "ok",
  });
  const res = await runStandardComboFallbackChain(chainOptions(handler));

  assert.equal(res.status, 400);
  assert.deepEqual(handler.order(), [M1]);
});

test("bad-quality 200: chain advances to the next model", async () => {
  // An empty `choices` array is NOT a quality failure — a present choice whose
  // message carries neither content nor tool_calls is.
  const handler = makeScriptedHandler({ [M1]: "bad-quality", [M2]: "ok" });
  const res = await runStandardComboFallbackChain(chainOptions(handler));

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M1, M2]);
  const body = await res.json();
  assert.equal(body.choices[0].message.content, "hello");
});

test("all models fail: exhausted response carries the failure status and message", async () => {
  const handler = makeScriptedHandler({ "*": 500 });
  const res = await runStandardComboFallbackChain(chainOptions(handler));

  assert.equal(res.status, 500);
  assert.deepEqual(handler.order(), [M1, M2]);
  const body = await res.json();
  assert.match(String(body.error?.message), /Upstream failure 500/);
});

test("every model unavailable: handler never called, ALL_ACCOUNTS_INACTIVE returned", async () => {
  const handler = makeScriptedHandler({ "*": "ok" });
  const res = await runStandardComboFallbackChain(
    chainOptions(handler, { isModelAvailable: async () => false })
  );

  assert.equal(res.status, 503);
  assert.deepEqual(handler.order(), []);
  const body = await res.json();
  assert.equal(body.error?.code, "ALL_ACCOUNTS_INACTIVE");
});

test("open circuit breaker: model skipped without calling the handler", async () => {
  openBreaker(M1);
  const handler = makeScriptedHandler({ [M2]: "ok" });
  const options = chainOptions(handler);
  const res = await runStandardComboFallbackChain(options);

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M2]);
  assert.ok(options.log.find(/circuit breaker OPEN/), "skip should be logged");
});

// ─── Exhausted response coherence (H1, RT-15) ───────────────────────────────

test("exhausted status and message come from the same attempt", async () => {
  // "provider returned error" makes the 400 fall through to the next model
  // instead of terminating the chain, so two different statuses are recorded.
  const handler = makeScriptedHandler({
    [M1]: { status: 400, body: { error: { message: "provider returned error: boom" } } },
    [M2]: { status: 429, body: { error: { message: "rate limit exceeded" } } },
  });
  const res = await runStandardComboFallbackChain(chainOptions(handler));

  assert.deepEqual(handler.order(), [M1, M2]);
  // The last attempt is the 429, and `respondComboModelsExhausted` maps 429→503.
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(String(body.error?.message), /rate limit exceeded/);
});

test("an unparseable upstream body never reaches the client", async () => {
  const rawBody = "<html><body>internal-host.corp.example proj_9f3 billing=past_due</body></html>";
  const handler = makeScriptedHandler({
    "*": { status: 500, text: rawBody, headers: { "Content-Type": "text/html" } },
  });
  const options = chainOptions(handler, { orderedModels: [M1] });
  const res = await runStandardComboFallbackChain(options);

  const payload = await res.text();
  assert.doesNotMatch(payload, /internal-host\.corp\.example/);
  assert.doesNotMatch(payload, /proj_9f3/);
  assert.doesNotMatch(payload, /past_due/);
  assert.match(String(JSON.parse(payload).error?.message), /Upstream error 500/);

  // The raw body is still available to whoever is debugging — in the logs.
  const logged = options.log.entries.find((e) =>
    String(e.meta?.upstreamError ?? "").includes("internal-host.corp.example")
  );
  assert.ok(logged, "raw upstream body should still be logged server-side");
});

test("a JSON error message still reaches the client", async () => {
  const handler = makeScriptedHandler({
    "*": { status: 500, body: { error: { message: "model overloaded, try later" } } },
  });
  const res = await runStandardComboFallbackChain(chainOptions(handler, { orderedModels: [M1] }));
  const body = await res.json();
  assert.match(String(body.error?.message), /model overloaded, try later/);
});

// ─── fallbackCount (M4) ─────────────────────────────────────────────────────

test("a breaker-skipped model does not inflate fallbackCount", async () => {
  openBreaker(M1);
  openBreaker(M2);
  const handler = makeScriptedHandler({ [M3]: "ok" });
  const options = chainOptions(handler, { orderedModels: [M1, M2, M3] });
  const res = await runStandardComboFallbackChain(options);

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M3]);
  // M3 is the first model actually attempted, so it is not a fallback.
  assert.equal(getComboMetrics(options.combo.name)?.totalFallbacks, 0);
});

test("a fallback from index 0 is counted", async () => {
  const handler = makeScriptedHandler({ [M1]: 500, [M2]: "ok" });
  const options = chainOptions(handler);
  const res = await runStandardComboFallbackChain(options);

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M1, M2]);
  assert.equal(getComboMetrics(options.combo.name)?.totalFallbacks, 1);
});

test("a first-model success reports zero fallbacks", async () => {
  const handler = makeScriptedHandler({ "*": "ok" });
  const options = chainOptions(handler);
  await runStandardComboFallbackChain(options);
  assert.equal(getComboMetrics(options.combo.name)?.totalFallbacks, 0);
});

test("retries on one model are not fallbacks", async () => {
  const handler = makeScriptedHandler({ [M1]: [429, "ok"] });
  const options = chainOptions(handler, { orderedModels: [M1], maxRetries: 1 });
  const res = await runStandardComboFallbackChain(options);

  assert.equal(res.status, 200);
  assert.deepEqual(handler.order(), [M1, M1]);
  assert.equal(getComboMetrics(options.combo.name)?.totalFallbacks, 0);
});
