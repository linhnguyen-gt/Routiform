import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-openclaw-data-"));
const TEST_CLI_HOME = fs.mkdtempSync(path.join(os.homedir(), "routiform-openclaw-home-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.CLI_CONFIG_HOME = TEST_CLI_HOME;

const core = await import("../../src/lib/db/core.ts");
const route = await import("../../src/app/api/cli-tools/openclaw-settings/route.ts");

const SETTINGS_PATH = path.join(TEST_CLI_HOME, ".openclaw", "openclaw.json");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CLI_HOME, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  fs.mkdirSync(TEST_CLI_HOME, { recursive: true });
}

function makeRequest(body) {
  return new Request("http://localhost/api/cli-tools/openclaw-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CLI_HOME, { recursive: true, force: true });
});

test("openclaw settings route writes primary from first model and preserves full model list", async () => {
  const response = await route.POST(
    makeRequest({
      baseUrl: "http://localhost:20128",
      apiKey: "sk-test",
      models: [
        "openrouter/openai/gpt-5.4",
        "anthropic/claude-sonnet-4-5",
        "openrouter/openai/gpt-5.4",
      ],
    })
  );
  const body = await response.json();
  const saved = JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(saved.agents.defaults.model.primary, "routiform/openrouter/openai/gpt-5.4");
  assert.deepEqual(saved.models.providers.routiform.models, [
    { id: "openrouter/openai/gpt-5.4", name: "gpt-5.4" },
    { id: "anthropic/claude-sonnet-4-5", name: "claude-sonnet-4-5" },
  ]);
  assert.equal(saved.models.providers.routiform.baseUrl, "http://localhost:20128/v1");
});

test("openclaw settings route still supports legacy single-model payload", async () => {
  const response = await route.POST(
    makeRequest({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "sk-test",
      model: "openrouter/openai/gpt-5.4",
    })
  );
  const saved = JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));

  assert.equal(response.status, 200);
  assert.equal(saved.agents.defaults.model.primary, "routiform/openrouter/openai/gpt-5.4");
  assert.deepEqual(saved.models.providers.routiform.models, [
    { id: "openrouter/openai/gpt-5.4", name: "gpt-5.4" },
  ]);
});
