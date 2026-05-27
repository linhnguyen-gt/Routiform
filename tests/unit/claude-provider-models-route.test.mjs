import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-claude-models-"));
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

test("claude models route fetches available models from Anthropic API", async () => {
  await resetStorage();

  const connection = await providersDb.createProviderConnection({
    provider: "claude",
    authType: "oauth",
    name: "claude-oauth",
    accessToken: "access-token-123",
    refreshToken: "refresh-token-123",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.equal(url, "https://api.anthropic.com/v1/models");
    assert.equal(init?.method, "GET");
    assert.equal(init?.headers?.Authorization, "Bearer access-token-123");
    assert.equal(init?.headers?.["anthropic-version"], "2023-06-01");

    return Response.json({
      data: [
        { id: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
        { id: "claude-opus-4-6", display_name: "Claude Opus 4.6" },
        { id: "claude-opus-4-5-20251101", display_name: "Claude Opus 4.5" },
        { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
        { id: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5" },
        { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
        { id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" },
      ],
    });
  };

  try {
    const response = await modelsRoute.GET(
      new Request(`http://localhost/api/providers/${connection.id}/models`),
      { params: { id: connection.id } }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.models, [
      { id: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
