/**
 * Regression: testing a retired model suspended the whole provider account.
 *
 * NVIDIA answers 410 Gone for model ids it has withdrawn. 410 matched no branch in the
 * fallback classifier, so it fell through to the catch-all transient cooldown and wrote a
 * connection-level `rateLimitedUntil`. The model test buttons fire one request per model
 * within the same second, so the first retired model took the account out for the whole
 * window and every model queued behind it failed instantly — each reported with the *first*
 * model's error text rather than its own.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-retired-model-410-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const auth = await import("../../src/sse/services/auth.ts");
const { isModelUnavailableError } = await import("../../open-sse/services/modelFamilyFallback.ts");

const GONE_BODY = JSON.stringify({
  type: "about:blank",
  title: "Gone",
  status: 410,
  detail: "The model 'meta/llama-4-maverick-17b-128e-instruct' is no longer available.",
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

async function freshConnection() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  return providersDb.createProviderConnection({
    provider: "nvidia",
    authType: "apikey",
    apiKey: "nvapi-test",
    isActive: true,
    testStatus: "active",
  });
}

test("410 Gone is a statement about the model, like 404", () => {
  assert.equal(isModelUnavailableError(410, GONE_BODY), true);
});

test("a retired model leaves the connection selectable for every other model", async () => {
  const conn = await freshConnection();

  const result = await auth.markAccountUnavailable(
    conn.id,
    410,
    GONE_BODY,
    "nvidia",
    "meta/llama-4-maverick-17b-128e-instruct"
  );

  assert.equal(result.shouldFallback, true);

  const [stored] = (await providersDb.getProviderConnections({ provider: "nvidia" })).filter(
    (c) => c.id === conn.id
  );
  assert.equal(stored.rateLimitedUntil ?? null, null, "connection must not be put on cooldown");
  assert.equal(stored.isActive, true);
  assert.notEqual(stored.testStatus, "unavailable");
});

test("the retired model itself is still recorded on the account", async () => {
  const conn = await freshConnection();

  await auth.markAccountUnavailable(
    conn.id,
    410,
    GONE_BODY,
    "nvidia",
    "meta/llama-4-maverick-17b-128e-instruct"
  );

  const [stored] = (await providersDb.getProviderConnections({ provider: "nvidia" })).filter(
    (c) => c.id === conn.id
  );
  assert.equal(stored.lastErrorType, "model_unavailable");
  assert.equal(Number(stored.errorCode), 410);
});
