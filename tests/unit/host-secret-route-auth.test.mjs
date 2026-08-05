import test from "node:test";
import assert from "node:assert/strict";

/**
 * Routes that read credentials off the host machine — a local IDE's stored OAuth tokens — used the
 * same credential check as every other privileged route. That check accepts a Bearer gateway API
 * key, and gateway keys live in one key space: the key handed to Cursor or Cline for `/v1` chat
 * completions is the same key `validateApiKey` accepts here. An inference client could therefore
 * read the operator's upstream credentials.
 *
 * `isHostSecretAuthenticated` closes that: a session cookie proves the dashboard, and installs with
 * no login at all fall back to same-origin — which the browser sends and a bare Bearer request does
 * not. No path through it consults `validateApiKey`.
 *
 * The three callers are `/api/oauth/{cursor,kiro,devin}/auto-import`, each reached only from a
 * same-origin dashboard modal.
 */

const { isHostSecretAuthenticated, isPrivilegedAuthenticated } =
  await import("../../src/shared/utils/apiAuth.ts");
const acpAgentsRoute = await import("../../src/app/api/acp/agents/route.ts");
const localDb = await import("../../src/lib/localDb.ts");
const { createApiKey, deleteApiKey } = await import("../../src/lib/db/apiKeys.ts");

const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;

async function withSettings(patch, fn) {
  delete process.env.INITIAL_PASSWORD;
  await localDb.updateSettings({
    requireLogin: true,
    setupComplete: false,
    password: "",
    ...patch,
  });
  try {
    return await fn();
  } finally {
    if (ORIGINAL_INITIAL_PASSWORD === undefined) delete process.env.INITIAL_PASSWORD;
    else process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
}

function requestWith(headers = {}) {
  return new Request("http://localhost:20128/api/oauth/cursor/auto-import", {
    method: "GET",
    headers: { host: "localhost:20128", ...headers },
  });
}

const LOGIN_ENFORCED = { requireLogin: true, setupComplete: true, password: "hashed" };
const NO_LOGIN = { requireLogin: false };

test("rejects a request carrying no credential at all", async () => {
  await withSettings(LOGIN_ENFORCED, async () => {
    assert.equal(await isHostSecretAuthenticated(requestWith()), false);
  });
});

// A real, valid gateway key — the differential the whole fix is about. Asserting against a
// made-up string would pass on the unfixed code too, since that string is invalid either way.
async function withRealGatewayKey(fn) {
  const created = await createApiKey("host-secret-auth-test", "test-machine-id");
  const key = created?.key ?? created?.apiKey ?? created?.value;
  assert.ok(key, "test needs a usable generated key");
  try {
    return await fn(key);
  } finally {
    if (created?.id) await deleteApiKey(created.id);
  }
}

test("a valid gateway API key opens a privileged route but NOT a host-secret one", async () => {
  await withSettings(LOGIN_ENFORCED, async () => {
    await withRealGatewayKey(async (key) => {
      const request = () => requestWith({ authorization: `Bearer ${key}` });

      assert.equal(
        await isPrivilegedAuthenticated(request()),
        true,
        "baseline: this key satisfies the ordinary privileged check"
      );
      assert.equal(
        await isHostSecretAuthenticated(request()),
        false,
        "an inference key must not read host credentials"
      );
    });
  });
});

test("a valid gateway API key does not reach it on a no-login install either", async () => {
  await withSettings(NO_LOGIN, async () => {
    await withRealGatewayKey(async (key) => {
      assert.equal(
        await isHostSecretAuthenticated(requestWith({ authorization: `Bearer ${key}` })),
        false,
        "dropping the login requirement must not hand host credentials to /v1 clients"
      );
    });
  });
});

test("the dashboard modal still works on a no-login install", async () => {
  await withSettings(NO_LOGIN, async () => {
    assert.equal(
      await isHostSecretAuthenticated(requestWith({ "sec-fetch-site": "same-origin" })),
      true,
      "the auto-import modals are the only caller and must keep working"
    );
  });
});

test("a cross-site request is refused even with no login configured", async () => {
  await withSettings(NO_LOGIN, async () => {
    assert.equal(
      await isHostSecretAuthenticated(requestWith({ "sec-fetch-site": "cross-site" })),
      false
    );
  });
});

test("falls back to Referer when the browser sends no Sec-Fetch-Site", async () => {
  await withSettings(NO_LOGIN, async () => {
    assert.equal(
      await isHostSecretAuthenticated(
        requestWith({ referer: "http://localhost:20128/dashboard/providers" })
      ),
      true
    );
  });
});

test("a Referer from another host is refused", async () => {
  await withSettings(NO_LOGIN, async () => {
    assert.equal(
      await isHostSecretAuthenticated(requestWith({ referer: "https://evil.example/page" })),
      false
    );
  });
});

test("same-origin does not substitute for a session once login is enforced", async () => {
  await withSettings(LOGIN_ENFORCED, async () => {
    assert.equal(
      await isHostSecretAuthenticated(requestWith({ "sec-fetch-site": "same-origin" })),
      false,
      "on an install with login, only a real session opens this route"
    );
  });
});

/**
 * Route level, not just helper level: the ACP agents route persists a command this host later
 * executes, so a gateway key reaching it is the whole reason `isHostSecretAuthenticated` exists.
 */
test("POST /api/acp/agents refuses a valid gateway key with no session", async () => {
  await withSettings(LOGIN_ENFORCED, async () => {
    await withRealGatewayKey(async (rawKey) => {
      const response = await acpAgentsRoute.POST(
        new Request("http://localhost:20128/api/acp/agents", {
          method: "POST",
          headers: {
            host: "localhost:20128",
            authorization: `Bearer ${rawKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "evil",
            name: "Evil",
            binary: "evil",
            versionCommand: "evil --version",
          }),
        })
      );
      assert.equal(response.status, 401);
    });
  });
});

test("GET /api/acp/agents refuses a request with no credential", async () => {
  await withSettings(LOGIN_ENFORCED, async () => {
    const response = await acpAgentsRoute.GET(
      new Request("http://localhost:20128/api/acp/agents", {
        method: "GET",
        headers: { host: "localhost:20128" },
      })
    );
    assert.equal(response.status, 401);
  });
});
