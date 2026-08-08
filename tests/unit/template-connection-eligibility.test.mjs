/**
 * Combo templates must not build a combo out of a connection that is failing everything.
 *
 * The gap this closes: `provider_connections.test_status` is only written by an explicit
 * connection test, so it can read `"active"` from a test months old while every real
 * request the connection serves returns 400. `isTemplateEligibleConnection` trusted that
 * field alone, so the dead connection kept winning a slot in every generated combo — and
 * because nothing else disqualified it, no amount of failing changed the outcome.
 *
 * Recent `usage_history` outcomes are the honest signal, surfaced on the connection as
 * `recentAttempts` / `recentSuccesses` by `GET /api/providers`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { isTemplateEligibleConnection } =
  await import("../../src/app/(dashboard)/dashboard/combos/components/combo-template-policies.ts");

/** A connection that passes every pre-existing check, so each test varies one thing. */
function connection(patch = {}) {
  return {
    id: "conn-1",
    provider: "openai",
    credentialsConfigured: true,
    testStatus: "active",
    isActive: 1,
    ...patch,
  };
}

test("a healthy connection is eligible", () => {
  assert.equal(isTemplateEligibleConnection(connection()), true);
});

test("a connection whose every recent request failed is excluded", () => {
  // The exact shape of the real gemini connection: test_status "active" from a stale
  // test, two recent requests, both failed (400 then 502).
  const dead = connection({ recentAttempts: 2, recentSuccesses: 0 });
  assert.equal(
    isTemplateEligibleConnection(dead),
    false,
    "a stale 'active' testStatus must not rescue a connection that fails everything"
  );
});

test("one isolated failure is not enough to disqualify", () => {
  const blip = connection({ recentAttempts: 1, recentSuccesses: 0 });
  assert.equal(isTemplateEligibleConnection(blip), true, "a single upstream blip proves nothing");
});

test("a connection with any success stays eligible however bad the ratio", () => {
  const flaky = connection({ recentAttempts: 50, recentSuccesses: 1 });
  assert.equal(
    isTemplateEligibleConnection(flaky),
    true,
    "partial failure is what retry and fallback exist to absorb"
  );
});

test("a never-used connection is eligible — absent counts are not zero counts", () => {
  const fresh = connection();
  assert.equal(fresh.recentAttempts, undefined);
  assert.equal(isTemplateEligibleConnection(fresh), true);

  // The failure mode if the API ever zero-fills instead of omitting.
  const zeroFilled = connection({ recentAttempts: 0, recentSuccesses: 0 });
  assert.equal(isTemplateEligibleConnection(zeroFilled), true);
});

test("the pre-existing disqualifiers still hold", () => {
  assert.equal(isTemplateEligibleConnection(connection({ credentialsConfigured: false })), false);
  assert.equal(isTemplateEligibleConnection(connection({ testStatus: "error" })), false);
  assert.equal(isTemplateEligibleConnection(connection({ isActive: 0 })), false);
  assert.equal(isTemplateEligibleConnection(connection({ isActive: false })), false);
  assert.equal(isTemplateEligibleConnection(connection({ provider: "" })), false);
  assert.equal(isTemplateEligibleConnection(null), false);
});

test("testStatus 'unknown' still passes — untested is not failed", () => {
  assert.equal(isTemplateEligibleConnection(connection({ testStatus: "unknown" })), true);
});
