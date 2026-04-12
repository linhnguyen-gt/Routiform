import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-token-health-route-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const route = await import("../../src/app/api/token-health/route.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("token health route counts active refresh failures as warning instead of error", async () => {
  await providersDb.createProviderConnection({
    provider: "claude",
    authType: "oauth",
    email: "warning@example.com",
    name: "warning@example.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isActive: true,
    testStatus: "error",
    lastError: "Health check: token refresh failed",
    lastErrorAt: "2026-04-09T04:40:00.000Z",
    lastErrorType: "token_refresh_failed",
    lastErrorSource: "oauth",
    errorCode: "refresh_failed",
  });

  await providersDb.createProviderConnection({
    provider: "claude",
    authType: "oauth",
    email: "healthy@example.com",
    name: "healthy@example.com",
    accessToken: "access-token-2",
    refreshToken: "refresh-token-2",
    isActive: true,
    testStatus: "active",
    lastError: null,
    lastErrorAt: null,
    lastErrorType: null,
    lastErrorSource: null,
    errorCode: null,
  });

  const response = await route.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.total, 2);
  assert.equal(body.healthy, 1);
  assert.equal(body.errored, 0);
  assert.equal(body.warning, 1);
  assert.equal(body.status, "warning");
});

test("token health route counts expired oauth connections as errored", async () => {
  await providersDb.createProviderConnection({
    provider: "claude",
    authType: "oauth",
    email: "expired@example.com",
    name: "expired@example.com",
    accessToken: "access-token-3",
    refreshToken: "refresh-token-3",
    isActive: true,
    testStatus: "expired",
    lastError: "Token expired",
    lastErrorAt: "2026-04-09T04:45:00.000Z",
    lastErrorType: "token_expired",
    lastErrorSource: "oauth",
    errorCode: "expired",
  });

  const response = await route.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.healthy, 0);
  assert.equal(body.errored, 1);
  assert.equal(body.warning, 0);
  assert.equal(body.status, "error");
});
