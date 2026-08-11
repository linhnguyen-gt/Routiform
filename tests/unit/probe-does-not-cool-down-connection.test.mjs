/**
 * Regression: one failing model test knocked out every model test behind it.
 *
 * The test buttons run through the ordinary chat path, one request per model, dozens within
 * the same second. Each failure was recorded on the account exactly as a client request's
 * would be — a connection-level `rateLimitedUntil` plus a bumped backoff level — so the
 * first model to fail suspended the account for the whole cooldown window and every model
 * queued behind it failed instantly, each reported with the *first* model's error text.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-probe-cooldown-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const { resolveAccountFallbackDecision } =
  await import("../../src/sse/handlers/chat-account-fallback-decision.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

async function freshConnection() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  return providersDb.createProviderConnection({
    provider: "groq",
    authType: "apikey",
    apiKey: "gsk-test",
    isActive: true,
    testStatus: "active",
  });
}

async function reload(connectionId) {
  const rows = await providersDb.getProviderConnections({ provider: "groq" });
  return rows.find((row) => row.id === connectionId);
}

const RATE_LIMITED = {
  status: 429,
  errorText: "Rate limit reached for model llama-3.3-70b",
  provider: "groq",
  model: "llama-3.3-70b",
  headers: null,
};

test("a probe leaves the account exactly as it found it", async () => {
  const conn = await freshConnection();

  const decision = await resolveAccountFallbackDecision({
    isProbe: true,
    connectionId: conn.id,
    ...RATE_LIMITED,
  });

  assert.equal(decision.cooldownMs, 0, "a probe must never make the caller wait");
  assert.equal(decision.shouldFallback, true, "another account is still worth trying");

  const stored = await reload(conn.id);
  assert.equal(stored.rateLimitedUntil ?? null, null);
  assert.equal(stored.testStatus, "active");
  assert.equal(stored.backoffLevel ?? 0, 0);
});

test("client traffic still records the failure", async () => {
  const conn = await freshConnection();

  const decision = await resolveAccountFallbackDecision({
    isProbe: false,
    connectionId: conn.id,
    ...RATE_LIMITED,
  });

  assert.equal(decision.shouldFallback, true);
  assert.ok(decision.cooldownMs > 0, "a real rate limit still earns a cooldown");

  const stored = await reload(conn.id);
  assert.ok(stored.rateLimitedUntil, "connection is put on cooldown for client traffic");
  assert.equal(stored.testStatus, "unavailable");
});

test("a probe against a bad request does not send the caller hunting other accounts", async () => {
  const conn = await freshConnection();

  const decision = await resolveAccountFallbackDecision({
    isProbe: true,
    connectionId: conn.id,
    status: 400,
    errorText: "messages: field required",
    provider: "groq",
    model: "llama-3.3-70b",
    headers: null,
  });

  assert.equal(decision.shouldFallback, false, "the same payload fails on every account");
  assert.equal(decision.cooldownMs, 0);
});
