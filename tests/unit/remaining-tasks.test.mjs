import test from "node:test";
import assert from "node:assert/strict";

// ═════════════════════════════════════════════════════
//  Remaining Tasks Tests: Telemetry, Domain Extraction
// ═════════════════════════════════════════════════════

// ─── Request Telemetry (T-45) ────────────────────

import {
  RequestTelemetry,
  recordTelemetry,
  getTelemetrySummary,
} from "../../src/shared/utils/requestTelemetry.ts";

test("RequestTelemetry: records phases", async () => {
  const t = new RequestTelemetry("tel-1");
  t.startPhase("parse");
  t.endPhase();
  t.startPhase("validate");
  t.endPhase();

  const summary = t.getSummary();
  assert.equal(summary.phases.length, 2);
  assert.equal(summary.phases[0].phase, "parse");
  assert.equal(summary.phases[1].phase, "validate");
});

test("RequestTelemetry: measure() wraps async functions", async () => {
  const t = new RequestTelemetry("tel-2");
  const result = await t.measure("parse", async () => "parsed");
  assert.equal(result, "parsed");
  assert.equal(t.getSummary().phases.length, 1);
  assert.equal(t.getSummary().phases[0].phase, "parse");
});

test("RequestTelemetry: measure() records errors", async () => {
  const t = new RequestTelemetry("tel-3");
  await assert.rejects(
    () =>
      t.measure("connect", async () => {
        throw new Error("timeout");
      }),
    (err) => err.message === "timeout"
  );
  assert.equal(t.getSummary().phases[0].error, "timeout");
});

test("RequestTelemetry: getTelemetrySummary returns valid output", () => {
  const t = new RequestTelemetry("tel-4");
  t.startPhase("parse");
  t.endPhase();
  recordTelemetry(t);

  const summary = getTelemetrySummary();
  assert.ok(summary.count > 0);
  assert.ok(typeof summary.p50 === "number");
  assert.ok(typeof summary.p95 === "number");
});

// ─── Lockout Policy ──────────────────────────────

import {
  checkLockout,
  recordFailedAttempt,
  recordSuccess,
  forceUnlock,
} from "../../src/domain/lockoutPolicy.ts";

test("lockoutPolicy: initially not locked", () => {
  const result = checkLockout("user-fresh");
  assert.equal(result.locked, false);
});

test("lockoutPolicy: locks after max attempts", () => {
  const config = { maxAttempts: 3, lockoutDurationMs: 60000, attemptWindowMs: 60000 };
  const id = "user-lock-test-" + Date.now();

  recordFailedAttempt(id, config);
  recordFailedAttempt(id, config);
  const result = recordFailedAttempt(id, config);

  assert.equal(result.locked, true);
  assert.ok(result.remainingMs > 0);
});

test("lockoutPolicy: recordSuccess clears state", () => {
  const id = "user-success-" + Date.now();
  recordFailedAttempt(id);
  recordSuccess(id);

  const result = checkLockout(id);
  assert.equal(result.locked, false);
  assert.equal(result.attempts, 0);
});

test("lockoutPolicy: forceUnlock works", () => {
  const config = { maxAttempts: 1, lockoutDurationMs: 60000, attemptWindowMs: 60000 };
  const id = "user-force-" + Date.now();

  recordFailedAttempt(id, config);
  forceUnlock(id);

  const result = checkLockout(id);
  assert.equal(result.locked, false);
});
