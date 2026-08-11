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
    // The route requires host-secret auth; a browser proves it with Sec-Fetch-Site.
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
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

/**
 * Stands in for this app's own /v1/models, which is where every CLI tool's config gets its
 * token limits from. Restores the real fetch so the surrounding tests keep exercising the
 * unreachable-catalog path.
 */
async function withModelCatalog(entries, run) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...rest) => {
    if (String(url).includes("/v1/models")) {
      return new Response(JSON.stringify({ data: entries }), {
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(url, ...rest);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The catalog is stubbed empty in the two tests below. They are about the primary model,
// deduplication and the base URL, and the route reads token limits from a real port — so
// without a stub they assert a different model shape depending on whether the app happens
// to be running on the developer's machine.
test("openclaw settings route writes primary from first model and preserves full model list", async () => {
  await withModelCatalog([], async () => {
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
});

/**
 * OpenClaw reads each model entry's own `contextWindow` to draw its context meter, and
 * falls back to a flat 200k when the field is missing. Writing entries without it meant a
 * combo published with a 300k window still reported usage against 200k, while every other
 * CLI tool configured from here showed the real number.
 */
test("the model's real context window reaches the config", async () => {
  await withModelCatalog(
    [
      { id: "agents-combo", context_length: 300000, max_output_tokens: 64000 },
      { id: "openrouter/openai/gpt-5.4", context_length: 400000 },
    ],
    async () => {
      const response = await route.POST(
        makeRequest({
          baseUrl: "http://localhost:20128",
          apiKey: "sk-test",
          models: ["agents-combo", "openrouter/openai/gpt-5.4"],
        })
      );
      assert.equal(response.status, 200);

      const saved = JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));
      assert.deepEqual(saved.models.providers.routiform.models, [
        {
          id: "agents-combo",
          name: "agents-combo",
          contextWindow: 300000,
          maxTokens: 64000,
        },
        {
          id: "openrouter/openai/gpt-5.4",
          name: "gpt-5.4",
          contextWindow: 400000,
        },
      ]);
    }
  );
});

test("a model the catalog knows nothing about is left to OpenClaw's own default", async () => {
  await withModelCatalog([{ id: "something-else", context_length: 300000 }], async () => {
    const response = await route.POST(
      makeRequest({
        baseUrl: "http://localhost:20128",
        apiKey: "sk-test",
        models: ["agents-combo"],
      })
    );
    assert.equal(response.status, 200);

    const saved = JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));
    assert.deepEqual(saved.models.providers.routiform.models, [
      { id: "agents-combo", name: "agents-combo" },
    ]);
  });
});

test("a catalog that cannot be reached does not block the config being written", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connection refused");
  };
  try {
    const response = await route.POST(
      makeRequest({
        baseUrl: "http://localhost:20128",
        apiKey: "sk-test",
        models: ["agents-combo"],
      })
    );
    assert.equal(response.status, 200);

    const saved = JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));
    assert.deepEqual(saved.models.providers.routiform.models, [
      { id: "agents-combo", name: "agents-combo" },
    ]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("openclaw settings route still supports legacy single-model payload", async () => {
  await withModelCatalog([], async () => {
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
});
