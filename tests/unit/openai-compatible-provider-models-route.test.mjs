import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-openai-compat-models-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const modelsRoute = await import("../../src/app/api/providers/[id]/models/route.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("openai-compatible models route now reaches a loopback base URL", async () => {
  // This path used to be blocked by the outbound private-address policy, so an operator running a
  // local Ollama got a provider they could chat with but could not list models for. The two
  // operator-config call sites opt in; the base URL is written through a session-only route.
  await resetStorage();

  const connection = await providersDb.createProviderConnection({
    provider: "openai-compatible-loopback-route",
    authType: "apikey",
    name: "compat-loopback",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "http://127.0.0.1:11434/v1",
    },
  });

  const attempted = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    attempted.push(String(input?.url || input));
    return new Response(JSON.stringify({ data: [{ id: "llama3.2" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await modelsRoute.GET(
      new Request(`http://localhost/api/providers/${connection.id}/models`),
      { params: { id: connection.id } }
    );

    assert.equal(response.status, 200);
    assert.ok(
      attempted.some((url) => url.includes("127.0.0.1:11434")),
      `expected the loopback endpoint to be fetched, got ${JSON.stringify(attempted)}`
    );
    const body = await response.json();
    assert.deepEqual(
      body.models.map((m) => m.id),
      ["llama3.2"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai-compatible models route still surfaces a policy error, not a silent fallback", async () => {
  // Opting into loopback does not opt out of the rest of the policy. A credentialed URL is still
  // refused, and the refusal still reaches the client as a 400 rather than degrading to the cached
  // catalog, which would look like success.
  await resetStorage();

  const connection = await providersDb.createProviderConnection({
    provider: "openai-compatible-credentialed-route",
    authType: "apikey",
    name: "compat-credentialed",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "http://user:pass@127.0.0.1:11434/v1",
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called for blocked outbound URLs");
  };

  try {
    const response = await modelsRoute.GET(
      new Request(`http://localhost/api/providers/${connection.id}/models`),
      { params: { id: connection.id } }
    );

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /Blocked outbound request/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
