/**
 * The round-robin concurrency limiter.
 *
 * Two live bugs are pinned here as regression tests: `markRateLimited` resetting
 * a configured limit to the default (it called `getGate` with no max, and the
 * gate stored the max), and the slot being released when headers arrived rather
 * than when the stream ended.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-semaphore-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const semaphore = await import("../../open-sse/services/rateLimitSemaphore.ts");
const { releaseOnResponseComplete } =
  await import("../../open-sse/services/combo/combo-release-on-complete.ts");
const { handleRoundRobinCombo } =
  await import("../../open-sse/services/combo/combo-round-robin.ts");
const core = await import("../../src/lib/db/core.ts");
const { makeLog, resetComboGlobals } = await import("../helpers/combo-chain-harness.mjs");

const M = "groq/model-alpha";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(() => resetComboGlobals());

test.afterEach(() => {
  // A leaked slot must fail the suite here, not the next test.
  semaphore.resetAll();
  assert.deepEqual(semaphore.getStats(), {}, "resetAll should leave no gates behind");
});

test.after(() => {
  resetComboGlobals();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// ─── RT-4: the limit belongs to the acquisition, not to the gate ────────────

test("markRateLimited does not change the effective limit", async () => {
  // Regression test for the live bug: `markRateLimited` called `getGate` with no
  // maxConcurrency, and `getGate` wrote its default onto the shared gate. A
  // single 429 therefore cut a combo configured for 5 down to the default 3 —
  // visible here in the post-cooldown drain, which is the one path that used the
  // stored max without an `acquire` call to repair it first.
  const held = [];
  for (let i = 0; i < 5; i++) {
    held.push(await semaphore.acquire(M, { maxConcurrency: 5, timeoutMs: 500 }));
  }
  assert.equal(semaphore.getStats()[M].running, 5);

  const waiters = [];
  for (let i = 0; i < 5; i++) {
    waiters.push(semaphore.acquire(M, { maxConcurrency: 5, timeoutMs: 3000 }));
  }
  assert.equal(semaphore.getStats()[M].queued, 5);

  semaphore.markRateLimited(M, 100);
  for (const release of held) release();
  assert.equal(semaphore.getStats()[M].running, 0, "cooldown blocks the drain");

  // Cooldown lapses; the scheduled drain runs (+50ms buffer inside the module).
  // The margin is generous on purpose — this is the one wall-clock assertion in
  // the suite and a loaded runner must not turn it into a flake.
  await sleep(400);
  assert.equal(semaphore.getStats()[M].running, 5, "all 5 configured slots drain, not 3");
  assert.equal(semaphore.getStats()[M].queued, 0);

  for (const release of await Promise.all(waiters)) release();
});

test("two combos sharing a model each see their own limit — permissive first", async () => {
  const wide = [];
  for (let i = 0; i < 4; i++) {
    wide.push(await semaphore.acquire(M, { maxConcurrency: 20, timeoutMs: 100 }));
  }

  // The strict caller wants to be the only thing running on this model.
  await assert.rejects(
    () => semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 30 }),
    (err) => err.code === "SEMAPHORE_TIMEOUT"
  );

  for (const release of wide) release();
  const strict = await semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 100 });
  strict();
});

test("two combos sharing a model each see their own limit — restrictive first", async () => {
  const strict = await semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 100 });
  assert.equal(semaphore.getStats()[M].running, 1);

  // The strict acquisition does not lower the wide caller's ceiling.
  const wide = [];
  for (let i = 0; i < 3; i++) {
    wide.push(await semaphore.acquire(M, { maxConcurrency: 20, timeoutMs: 100 }));
  }
  assert.equal(semaphore.getStats()[M].running, 4);

  strict();
  for (const release of wide) release();
});

test("the rate-limit cooldown still applies across acquirers", async () => {
  semaphore.markRateLimited(M, 10_000);

  await assert.rejects(
    () => semaphore.acquire(M, { maxConcurrency: 20, timeoutMs: 30 }),
    (err) => err.code === "SEMAPHORE_TIMEOUT"
  );
  await assert.rejects(
    () => semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 30 }),
    (err) => err.code === "SEMAPHORE_TIMEOUT"
  );
  assert.ok(semaphore.getStats()[M].rateLimitedUntil, "cooldown is shared per model");
});

test("a queued waiter with a low limit is not skipped past by a later permissive one", async () => {
  // Two slots in flight, so a limit-1 waiter and a limit-2 waiter are both blocked.
  const held = [
    await semaphore.acquire(M, { maxConcurrency: 20, timeoutMs: 500 }),
    await semaphore.acquire(M, { maxConcurrency: 20, timeoutMs: 500 }),
  ];

  const order = [];
  const strict = semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 2000 }).then((release) => {
    order.push("strict");
    return release;
  });
  const permissive = semaphore
    .acquire(M, { maxConcurrency: 2, timeoutMs: 2000 })
    .then((release) => {
      order.push("permissive");
      return release;
    });

  assert.equal(semaphore.getStats()[M].queued, 2);
  assert.equal(semaphore.getStats()[M].queuedMax, 1, "the head waiter's limit is the reported one");

  // One slot back: the head waiter still cannot run (1 >= its limit of 1), and
  // the drain must stop there. Skipping ahead would admit the permissive waiter
  // (1 < 2) and starve the strict one.
  held[0]();
  await sleep(10);
  assert.deepEqual(order, [], "no waiter may jump the head of the queue");
  assert.equal(semaphore.getStats()[M].queued, 2);

  held[1]();
  const releases = await Promise.all([strict, permissive]);
  assert.deepEqual(order, ["strict", "permissive"], "FIFO order survives mixed limits");
  for (const release of releases) release();
});

test("a head waiter timing out wakes the waiters it was blocking", async () => {
  // The drain stops at a blocked head, and a release is the only other thing
  // that drains — so when the head leaves by timeout instead, the waiters it
  // was holding back have to be woken here or they wait for nothing.
  const held = [];
  for (let i = 0; i < 5; i++) {
    held.push(await semaphore.acquire(M, { maxConcurrency: 5, timeoutMs: 500 }));
  }

  const strict = semaphore.acquire(M, { maxConcurrency: 1, timeoutMs: 100 });
  const behind = [
    semaphore.acquire(M, { maxConcurrency: 5, timeoutMs: 5000 }),
    semaphore.acquire(M, { maxConcurrency: 5, timeoutMs: 5000 }),
  ];
  assert.equal(semaphore.getStats()[M].queued, 3);

  // Two slots back: the head (limit 1) still cannot run, so nothing drains.
  held[0]();
  held[1]();
  assert.equal(semaphore.getStats()[M].running, 3);
  assert.equal(semaphore.getStats()[M].queued, 3);

  await assert.rejects(strict, (err) => err.code === "SEMAPHORE_TIMEOUT");
  const releases = await Promise.all(behind);
  assert.equal(semaphore.getStats()[M].running, 5);
  assert.equal(semaphore.getStats()[M].queued, 0);

  for (const release of [...held.slice(2), ...releases]) release();
});

test("release is idempotent", async () => {
  const release = await semaphore.acquire(M, { maxConcurrency: 2 });
  assert.equal(semaphore.getStats()[M].running, 1);
  release();
  release();
  release();
  assert.equal(semaphore.getStats()[M].running, 0);
});

// ─── RT-13: releaseOnResponseComplete ──────────────────────────────────────

test("a non-streaming response releases immediately", () => {
  let released = 0;
  const res = releaseOnResponseComplete(new Response(null, { status: 204 }), () => released++);
  assert.equal(released, 1);
  assert.equal(res.status, 204);
});

test("a non-ok response releases immediately", async () => {
  let released = 0;
  const res = releaseOnResponseComplete(new Response("boom", { status: 500 }), () => released++);
  assert.equal(released, 1);
  assert.equal(await res.text(), "boom");
});

test("a streaming response holds the slot until the stream ends", async () => {
  let released = 0;
  let controller;
  const source = new Response(
    new ReadableStream({
      start(c) {
        controller = c;
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );

  const res = releaseOnResponseComplete(source, () => released++);
  const reader = res.body.getReader();

  controller.enqueue(new TextEncoder().encode("data: one\n\n"));
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "data: one\n\n");
  assert.equal(released, 0, "still streaming");

  controller.close();
  await reader.read();
  await sleep(10);
  assert.equal(released, 1);
});

test("a cancelled stream releases the slot", async () => {
  let released = 0;
  const source = new Response(
    new ReadableStream({
      start() {
        /* never closes */
      },
    }),
    { status: 200 }
  );

  const res = releaseOnResponseComplete(source, () => released++);
  await res.body.cancel();
  await sleep(10);
  assert.equal(released, 1);
});

test("an upstream stream error releases the slot", async () => {
  let released = 0;
  let controller;
  const source = new Response(
    new ReadableStream({
      start(c) {
        controller = c;
      },
    }),
    { status: 200 }
  );

  const res = releaseOnResponseComplete(source, () => released++);
  const reader = res.body.getReader();
  controller.error(new Error("upstream died"));
  await reader.read().catch(() => {});
  await sleep(10);
  assert.equal(released, 1);
});

test("headers are preserved through the passthrough", async () => {
  const source = new Response(new ReadableStream({ start: (c) => c.close() }), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "text/event-stream", "X-Model": M },
  });
  const res = releaseOnResponseComplete(source, () => {});
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(res.headers.get("x-model"), M);
  await res.body.cancel();
});

// ─── RT-13 end to end through the round-robin handler ──────────────────────

test("round-robin: getStats().running stays 1 for the duration of a stream", async () => {
  let controller;
  const handler = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );

  const res = await handleRoundRobinCombo({
    body: { stream: true },
    combo: { name: "rr-stream-slot", models: [M], config: { maxRetries: 0, retryDelayMs: 0 } },
    handleSingleModel: handler,
    log: makeLog(),
  });

  assert.equal(res.status, 200);
  assert.equal(semaphore.getStats()[M].running, 1, "slot held while the body is unread");

  const reader = res.body.getReader();
  controller.close();
  await reader.read();
  await sleep(10);
  assert.equal(semaphore.getStats()[M].running, 0, "slot returned when the stream ended");
});

test("round-robin: a non-streaming response releases its slot", async () => {
  const handler = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const res = await handleRoundRobinCombo({
    body: {},
    combo: { name: "rr-nonstream-slot", models: [M], config: { maxRetries: 0, retryDelayMs: 0 } },
    handleSingleModel: handler,
    log: makeLog(),
  });

  assert.equal(res.status, 200);
  await res.text();
  await sleep(10);
  assert.equal(semaphore.getStats()[M].running, 0);
});

test("round-robin: a failed model releases its slot before trying the next", async () => {
  const attempts = [];
  const handler = async (_body, modelStr) => {
    attempts.push(modelStr);
    assert.ok(
      (semaphore.getStats()[modelStr]?.running ?? 0) <= 1,
      "at most one slot per model in flight"
    );
    if (modelStr === M) {
      return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const other = "cerebras/model-beta";
  const res = await handleRoundRobinCombo({
    body: {},
    combo: {
      name: "rr-release-on-failure",
      models: [M, other],
      config: { maxRetries: 0, retryDelayMs: 0 },
    },
    handleSingleModel: handler,
    log: makeLog(),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(attempts, [M, other]);
  await res.text();
  await sleep(10);
  assert.equal(semaphore.getStats()[M].running, 0, "the failed model's slot was returned");
});
