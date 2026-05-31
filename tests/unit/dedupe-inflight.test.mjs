import test from "node:test";
import assert from "node:assert/strict";

import {
  clearInflight,
  computeRequestHash,
  detectSideEffect,
  getDedupCounters,
  readDedupeControls,
  recordMessageDedupe,
  resetDedupCounters,
  setDedupConfig,
  shouldDeduplicate,
  withInflightDedupe,
} from "../../open-sse/services/requestDedup.ts";

function newBody(overrides = {}) {
  return {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0.7,
    stream: false,
    ...overrides,
  };
}

test.beforeEach(() => {
  clearInflight();
  resetDedupCounters();
  setDedupConfig({ enabled: true, mode: "enforce", maxTemperatureForDedup: 1.0 });
});

test("computeRequestHash is stable for identical bodies", () => {
  const a = computeRequestHash(newBody());
  const b = computeRequestHash(newBody());
  assert.equal(a, b);
});

test("computeRequestHash changes when stream flag flips", () => {
  const nonStream = computeRequestHash(newBody({ stream: false }));
  const stream = computeRequestHash(newBody({ stream: true }));
  assert.notEqual(nonStream, stream);
});

test("computeRequestHash changes when content changes", () => {
  const a = computeRequestHash(newBody());
  const b = computeRequestHash(newBody({ messages: [{ role: "user", content: "world" }] }));
  assert.notEqual(a, b);
});

test("shouldDeduplicate respects mode=off", () => {
  setDedupConfig({ mode: "off" });
  assert.equal(shouldDeduplicate(newBody()), false);
});

test("shouldDeduplicate excludes high-temperature requests", () => {
  setDedupConfig({ mode: "enforce", maxTemperatureForDedup: 0.5 });
  assert.equal(shouldDeduplicate(newBody({ temperature: 0.9 })), false);
});

test("shouldDeduplicate allows streaming (no longer hard-excluded)", () => {
  assert.equal(shouldDeduplicate(newBody({ stream: true })), true);
});

test("detectSideEffect: last role=tool is side-effecting", () => {
  const body = {
    messages: [
      { role: "user", content: "do thing" },
      { role: "assistant", tool_calls: [{ id: "1" }] },
      { role: "tool", tool_call_id: "1", content: "result" },
    ],
  };
  assert.equal(detectSideEffect(body), true);
});

test("detectSideEffect: normal user-last request is NOT side-effecting", () => {
  assert.equal(detectSideEffect(newBody()), false);
});

test("readDedupeControls reads X-Routiform-No-Dedupe", () => {
  const h = new Headers({ "X-Routiform-No-Dedupe": "1" });
  const c = readDedupeControls(h);
  assert.equal(c.bypass, true);
  assert.equal(c.bypassReason, "header");
});

test("readDedupeControls reads Cache-Control: no-store", () => {
  const h = new Headers({ "Cache-Control": "no-store, max-age=0" });
  const c = readDedupeControls(h);
  assert.equal(c.bypass, true);
  assert.equal(c.bypassReason, "cache-control");
});

test("readDedupeControls reads Idempotency-Key", () => {
  const h = new Headers({ "Idempotency-Key": "abc-123" });
  const c = readDedupeControls(h);
  assert.equal(c.idempotencyKey, "abc-123");
  assert.equal(c.bypass, false);
});

test("readDedupeControls reads X-Routiform-Dedupe-TTL", () => {
  const h = new Headers({ "X-Routiform-Dedupe-TTL": "1500" });
  const c = readDedupeControls(h);
  assert.equal(c.ttlMsOverride, 1500);
});

test("readDedupeControls works on plain record headers", () => {
  const c = readDedupeControls({ "x-routiform-no-dedupe": "1" });
  assert.equal(c.bypass, true);
});

test("withInflightDedupe enforce: concurrent identical requests share upstream", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return new Response("ok", { status: 200 });
  };

  const body = newBody();
  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);

  assert.equal(calls, 1, "only one upstream call");
  assert.equal(a.wasDeduplicated, false);
  assert.equal(b.wasDeduplicated, true);
  // Each caller gets their own readable Response
  assert.equal(await a.result.text(), "ok");
  assert.equal(await b.result.text(), "ok");
  assert.equal(getDedupCounters().inflightHits, 1);
});

test("withInflightDedupe shadow: counts but does NOT share", async () => {
  setDedupConfig({ mode: "shadow" });
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return new Response("ok", { status: 200 });
  };

  const body = newBody();
  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);

  assert.equal(calls, 2, "shadow does not share upstream");
  assert.equal(a.wasDeduplicated, false);
  assert.equal(b.wasDeduplicated, false);
  assert.equal(getDedupCounters().shadowWouldHaveBlocked, 1);
});

test("withInflightDedupe bypass=true skips dedupe", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return new Response("ok");
  };
  const body = newBody();
  const [a, b] = await Promise.all([
    withInflightDedupe(body, fn, { bypass: true, bypassReason: "tool-result" }),
    withInflightDedupe(body, fn, { bypass: true, bypassReason: "tool-result" }),
  ]);
  assert.equal(calls, 2);
  assert.equal(a.wasDeduplicated, false);
  assert.equal(b.wasDeduplicated, false);
  assert.equal(getDedupCounters().bypassReasons["tool-result"], 2);
});

test("withInflightDedupe Idempotency-Key collapses different bodies under same key", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return new Response("ok");
  };
  // Two DIFFERENT bodies but same idempotency key — share inflight.
  const [a, b] = await Promise.all([
    withInflightDedupe(newBody({ messages: [{ role: "user", content: "x" }] }), fn, {
      keyOverride: "k1",
    }),
    withInflightDedupe(newBody({ messages: [{ role: "user", content: "y" }] }), fn, {
      keyOverride: "k1",
    }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.wasDeduplicated, false);
  assert.equal(b.wasDeduplicated, true);
  assert.equal(getDedupCounters().idempotencyKeyHits, 2);
});

test("withInflightDedupe: failed upstream evicts entry, second caller retries", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls === 1) {
      // ensure first caller registers as inflight, then fails
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("boom");
    }
    return new Response("ok");
  };
  const body = newBody();
  const first = withInflightDedupe(body, fn);
  await assert.rejects(first, /boom/);
  // Wait a tick so cleanup runs.
  await new Promise((r) => setTimeout(r, 5));
  const second = await withInflightDedupe(body, fn);
  assert.equal(second.wasDeduplicated, false);
  assert.equal(await second.result.text(), "ok");
  assert.equal(calls, 2);
});

test("withInflightDedupe: TTL expiry releases inflight slot", async () => {
  setDedupConfig({ ttlMs: 30, maxTtlMs: 30 });
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return new Response("ok");
  };
  const body = newBody();
  await withInflightDedupe(body, fn);
  await new Promise((r) => setTimeout(r, 60));
  await withInflightDedupe(body, fn);
  assert.equal(calls, 2);
});

test("recordMessageDedupe accumulates message-level counters", () => {
  recordMessageDedupe(0); // ignored
  recordMessageDedupe(2);
  recordMessageDedupe(3);
  const c = getDedupCounters();
  assert.equal(c.messageCollapsed, 5);
  assert.equal(c.messageCollapseRequests, 2);
});
