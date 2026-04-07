import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-cline-models-"));
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

test("Cline models route annotates recommended and free categories", async () => {
  await resetStorage();

  const connection = await providersDb.createProviderConnection({
    provider: "cline",
    authType: "oauth",
    name: "cline-main",
    accessToken: "cline-token",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    assert.equal(init.headers.Authorization, "Bearer cline-token");
    if (target === "https://api.cline.bot/api/v1/ai/cline/models") {
      return Response.json({
        data: [
          { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
          { id: "openai/gpt-4o-mini", name: "GPT 4o mini" },
        ],
      });
    }
    if (target === "https://api.cline.bot/api/v1/ai/cline/recommended-models") {
      return Response.json({
        recommended: [{ id: "anthropic/claude-sonnet-4.5" }],
        free: [{ id: "openai/gpt-4o-mini" }],
      });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  try {
    const response = await modelsRoute.GET(
      new Request(`http://localhost/api/providers/${connection.id}/models`),
      { params: { id: connection.id } }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.provider, "cline");
    assert.equal(body.models.length, 2);
    assert.deepEqual(body.models[0].clineMeta, {
      recommended: true,
      free: false,
      categories: ["recommended"],
    });
    assert.deepEqual(body.models[1].clineMeta, {
      recommended: false,
      free: true,
      categories: ["free"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cline models route still returns model catalog when category endpoint fails", async () => {
  await resetStorage();

  const connection = await providersDb.createProviderConnection({
    provider: "cline",
    authType: "oauth",
    name: "cline-main",
    accessToken: "cline-token",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target === "https://api.cline.bot/api/v1/ai/cline/models") {
      return Response.json({ data: [{ id: "openai/gpt-4o-mini", name: "GPT 4o mini" }] });
    }
    if (target === "https://api.cline.bot/api/v1/ai/cline/recommended-models") {
      return new Response("error", { status: 503 });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  try {
    const response = await modelsRoute.GET(
      new Request(`http://localhost/api/providers/${connection.id}/models`),
      { params: { id: connection.id } }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.models.length, 1);
    assert.equal(body.models[0].id, "openai/gpt-4o-mini");
    assert.equal(body.models[0].clineMeta, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
