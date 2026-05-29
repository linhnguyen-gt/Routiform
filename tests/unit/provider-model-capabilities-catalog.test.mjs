import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-model-capabilities-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const modelsDb = await import("../../src/lib/db/models.ts");
const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.afterEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("v1 models exposes max_output_tokens from synced and custom model metadata", async () => {
  const geminiConnection = await providersDb.createProviderConnection({
    provider: "gemini",
    authType: "apikey",
    name: "gemini-main",
    apiKey: "test-key",
    isActive: true,
  });

  await providersDb.createProviderConnection({
    provider: "openrouter",
    authType: "apikey",
    name: "openrouter-main",
    apiKey: "test-key",
    isActive: true,
  });

  await modelsDb.replaceSyncedAvailableModelsForConnection("gemini", geminiConnection.id, [
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      source: "api-sync",
      inputTokenLimit: 2097152,
      outputTokenLimit: 65536,
    },
  ]);

  await modelsDb.replaceCustomModels("openrouter", [
    {
      id: "custom-openrouter-model",
      name: "Custom OpenRouter Model",
      source: "auto-sync",
      inputTokenLimit: 256000,
      outputTokenLimit: 8192,
    },
  ]);

  const response = await v1ModelsCatalog.getUnifiedModelsResponse(
    new Request("http://localhost/api/v1/models", { method: "GET" })
  );

  assert.equal(response.status, 200);
  const body = await response.json();

  const geminiModel = body.data.find((model) => model.id === "gemini/gemini-2.5-pro");
  assert.ok(geminiModel);
  assert.equal(geminiModel.context_length, 2097152);
  assert.equal(geminiModel.max_output_tokens, 65536);

  const openrouterModel = body.data.find(
    (model) => model.id === "openrouter/custom-openrouter-model"
  );
  assert.ok(openrouterModel);
  assert.equal(openrouterModel.context_length, 256000);
  assert.equal(openrouterModel.max_output_tokens, 8192);
});
