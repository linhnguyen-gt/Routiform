import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-idp-dedup-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// NOTE: non-Codex OAuth dedup in createProviderConnection() keys on
// `provider + email` alone (see src/lib/db/providers.ts). A prior attempt to
// additionally match `providerSpecificData.username` (to distinguish two
// IdP logins sharing the same email) was reverted: nothing in the OAuth
// import/exchange routes ever populates `providerSpecificData.username`, so
// the extra check was permanently inert dead code. The cross-IdP clobber
// bug below is a KNOWN, NOT-FIXED issue — these tests document current
// (buggy) behavior so a future fix has a regression test to flip, and so
// nobody mistakes silence here for "already handled".

test("two OAuth logins with the same provider+email but different providerSpecificData.username still clobber each other (known issue, not fixed)", async () => {
  await resetStorage();

  const first = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "shared@example.com",
    accessToken: "access-idp-a",
    refreshToken: "refresh-idp-a",
    testStatus: "active",
    providerSpecificData: { username: "idp-a-user" },
  });

  const second = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "shared@example.com",
    accessToken: "access-idp-b",
    refreshToken: "refresh-idp-b",
    testStatus: "active",
    providerSpecificData: { username: "idp-b-user" },
  });

  // Documents the known bug: dedup is email-only, so the second login
  // updates the first connection in place instead of creating a distinct one.
  assert.equal(second.id, first.id, "email-only dedup clobbers distinct IdP logins (known issue)");

  const all = await providersDb.getProviderConnections({ provider: "glm" });
  assert.equal(all.length, 1);
  assert.equal(all[0].accessToken, "access-idp-b", "second login's tokens overwrote the first");
});

test("re-connecting with the same provider+email updates the existing connection in place", async () => {
  await resetStorage();

  const first = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "same-user@example.com",
    accessToken: "access-v1",
    refreshToken: "refresh-v1",
    testStatus: "active",
    providerSpecificData: { username: "same-user" },
  });

  const refreshed = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "same-user@example.com",
    accessToken: "access-v2",
    refreshToken: "refresh-v2",
    testStatus: "active",
    providerSpecificData: { username: "same-user" },
  });

  assert.equal(refreshed.id, first.id, "same identity should update, not duplicate");

  const all = await providersDb.getProviderConnections({ provider: "glm" });
  assert.equal(all.length, 1);
  assert.equal(all[0].accessToken, "access-v2");
});

test("legacy connections without a username still dedup on email alone (backward compat)", async () => {
  await resetStorage();

  const first = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "legacy@example.com",
    accessToken: "access-legacy-v1",
    refreshToken: "refresh-legacy-v1",
    testStatus: "active",
  });

  const refreshed = await providersDb.createProviderConnection({
    provider: "glm",
    authType: "oauth",
    email: "legacy@example.com",
    accessToken: "access-legacy-v2",
    refreshToken: "refresh-legacy-v2",
    testStatus: "active",
  });

  assert.equal(refreshed.id, first.id);

  const all = await providersDb.getProviderConnections({ provider: "glm" });
  assert.equal(all.length, 1);
  assert.equal(all[0].accessToken, "access-legacy-v2");
});
