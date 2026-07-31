import test from "node:test";
import assert from "node:assert/strict";

// `isAuthenticated` returns true outright when `isAuthRequired()` is false — which is the case on
// any install where the operator skipped setting a password, or set requireLogin=false. Routes
// that mint API keys or write upstream OAuth credentials must not be satisfied by "auth is not
// required": they sit behind the /api/v1/ and /api/oauth/ public prefixes, so proxy.ts never runs
// verifyAuth for them either, and nothing checks a Bearer token at all.

const { isPrivilegedAuthenticated } = await import("../../src/shared/utils/apiAuth.ts");

function requestWith(headers = {}) {
  return new Request("http://localhost:20128/api/v1/registered-keys", {
    method: "POST",
    headers,
  });
}

test("a privileged route rejects a request carrying no credential", async () => {
  assert.equal(
    await isPrivilegedAuthenticated(requestWith()),
    false,
    "key minting must demand a credential even when login is not required"
  );
});

test("a privileged route rejects a malformed bearer token", async () => {
  assert.equal(
    await isPrivilegedAuthenticated(requestWith({ authorization: "Bearer not-a-real-key" })),
    false
  );
});

test("a privileged route rejects a non-bearer authorization header", async () => {
  assert.equal(
    await isPrivilegedAuthenticated(requestWith({ authorization: "Basic abc123" })),
    false
  );
});
