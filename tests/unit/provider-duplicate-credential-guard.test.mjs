import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The stored credential never leaves the server — `GET /api/providers` strips `apiKey` — so a
 * dashboard cannot tell whether a pasted key is one it already holds. The create path decides,
 * and says so distinctly enough that a bulk paste can report "already stored" rather than
 * "failed". Without it, re-pasting last week's list silently doubles the rotation pool with
 * connections that share one upstream quota.
 */

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-dup-credential-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { getProviderConnections } = await import("../../src/lib/db/providers.ts");
const providersRoute = await import("../../src/app/api/providers/route.ts");

function postProvider(body) {
  return providersRoute.POST(
    new Request("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("a credential already stored for the provider is refused as a duplicate, not stored twice", async () => {
  const first = await postProvider({
    provider: "openai",
    name: "Key 1",
    apiKey: "sk-shared-value",
    authType: "apikey",
  });
  assert.equal(first.status, 201);

  const second = await postProvider({
    provider: "openai",
    name: "Key 2",
    apiKey: "sk-shared-value",
    authType: "apikey",
  });
  assert.equal(second.status, 409);

  const body = await second.json();
  assert.equal(body.error.code, "duplicate_credential");
  assert.match(
    body.error.message,
    /Key 1/,
    "the message must name the connection already holding it"
  );

  const connections = await getProviderConnections({ provider: "openai" });
  assert.equal(connections.length, 1);
  assert.equal(connections[0].name, "Key 1");
});

test("a different credential under a fresh name is still created", async () => {
  const res = await postProvider({
    provider: "openai",
    name: "Key 2",
    apiKey: "sk-a-different-value",
    authType: "apikey",
  });
  assert.equal(res.status, 201);

  const connections = await getProviderConnections({ provider: "openai" });
  assert.deepEqual(connections.map((c) => c.name).sort(), ["Key 1", "Key 2"]);
});

test("the same value under a different provider is not a duplicate", async () => {
  const res = await postProvider({
    provider: "anthropic",
    name: "Key 1",
    apiKey: "sk-shared-value",
    authType: "apikey",
  });
  assert.equal(res.status, 201);
  assert.equal((await getProviderConnections({ provider: "anthropic" })).length, 1);
});

test("the response never echoes the credential back", async () => {
  const res = await postProvider({
    provider: "openai",
    name: "Key 3",
    apiKey: "sk-yet-another-value",
    authType: "apikey",
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.connection.apiKey, undefined);
  assert.equal(body.connection.accessToken, undefined);
});
