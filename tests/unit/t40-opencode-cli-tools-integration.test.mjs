import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { CLI_TOOLS } = await import("../../src/shared/constants/cliTools.ts");
const { resolveOpencodeConfigPath } = await import("../../src/shared/services/cliRuntime.ts");
const { buildOpenCodeProviderConfigs, mergeOpenCodeConfig, toOpenCodeModelRef } =
  await import("../../src/shared/services/opencodeConfig.ts");

test("T40: OpenCode card documents config paths and --variant usage", () => {
  const opencode = CLI_TOOLS.opencode;
  assert.ok(opencode, "OpenCode tool card must exist");

  const notesText = (opencode.notes || [])
    .map((note) => note?.text || "")
    .join(" ")
    .toLowerCase();

  assert.match(notesText, /\.config\/opencode\/opencode\.json/);
  assert.match(notesText, /%appdata%/);
  assert.match(notesText, /--variant/);
});

test("T40: OpenCode config path resolves per-platform", () => {
  const linuxWithXdg = resolveOpencodeConfigPath(
    "linux",
    { XDG_CONFIG_HOME: "/tmp/xdg-config-home" },
    "/home/dev"
  );
  assert.equal(linuxWithXdg, path.join("/tmp/xdg-config-home", "opencode", "opencode.json"));

  const linuxDefault = resolveOpencodeConfigPath("linux", {}, "/home/dev");
  assert.equal(linuxDefault, path.join("/home/dev", ".config", "opencode", "opencode.json"));

  const windowsPath = resolveOpencodeConfigPath(
    "win32",
    { APPDATA: "C:\\Users\\dev\\AppData\\Roaming" },
    "C:\\Users\\dev"
  );
  assert.equal(
    windowsPath,
    path.join("C:\\Users\\dev\\AppData\\Roaming", "opencode", "opencode.json")
  );
});

test("T40: OpenCode config generator includes endpoint and selected API key", () => {
  const providerConfigs = buildOpenCodeProviderConfigs({
    baseUrl: "http://localhost:20128/v1/",
    apiKey: "sk_test_opencode",
    model: "claude-sonnet-4-5-thinking",
    models: ["openai/gpt-5.4", "claude-sonnet-4-5-thinking", "gg/gemini-2.5-pro"],
  });
  assert.equal(providerConfigs["routiform-openai"].options.baseURL, "http://localhost:20128/v1");
  assert.equal(providerConfigs["routiform-openai"].options.apiKey, "sk_test_opencode");
  assert.equal(providerConfigs["routiform-openai"].npm, "@ai-sdk/openai");
  assert.equal(providerConfigs["routiform-anthropic"].npm, "@ai-sdk/anthropic");
  assert.ok(providerConfigs["routiform-anthropic"].models["claude-sonnet-4-5-thinking"]);
  assert.ok(providerConfigs["routiform-openai"].models["openai/gpt-5.4"]);
  assert.deepEqual(providerConfigs["routiform-openai"].models["openai/gpt-5.4"].variants, {
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
    xhigh: { reasoningEffort: "xhigh" },
  });
  assert.deepEqual(
    providerConfigs["routiform-anthropic"].models["claude-sonnet-4-5-thinking"].variants,
    {
      high: { thinking: { type: "enabled", budgetTokens: 16000 } },
      max: { thinking: { type: "enabled", budgetTokens: 31999 } },
    }
  );
  assert.equal(providerConfigs["routiform-openai"].models["gg/gemini-2.5-pro"].variants, undefined);

  const mergedConfig = mergeOpenCodeConfig(
    {
      provider: {
        custom: { name: "Custom Provider" },
        routiform: { name: "Legacy Routiform Provider" },
      },
    },
    {
      baseUrl: "http://localhost:20128/v1",
      apiKey: "sk_test_opencode",
      models: ["openai/gpt-5.4", "claude-sonnet-4-5-thinking", "gg/gemini-2.5-pro"],
    }
  );
  assert.ok(mergedConfig.provider.custom);
  assert.equal(mergedConfig.provider.routiform, undefined);
  assert.equal(
    mergedConfig.provider["routiform-openai"].options.baseURL,
    "http://localhost:20128/v1"
  );
  assert.equal(mergedConfig.provider["routiform-openai"].options.apiKey, "sk_test_opencode");
  // The root `model` used to be left unset so the user could pick interactively. opencode then
  // stayed on the default it resolves by itself, so the provider and its `limit` were written
  // but never used and the context meter reported a different model's window. Apply now points
  // opencode at what was configured, matching every other tool.
  assert.equal(mergedConfig.model, "routiform-openai/openai/gpt-5.4");
  assert.ok(mergedConfig.provider["routiform-anthropic"].models["claude-sonnet-4-5-thinking"]);
  assert.ok(mergedConfig.$schema);
});

test("T40: OpenCode model refs follow the generated provider key", () => {
  assert.equal(toOpenCodeModelRef("cx/gpt-5.4"), "routiform-openai/cx/gpt-5.4");
  assert.equal(
    toOpenCodeModelRef("cc/claude-sonnet-4-20250514"),
    "routiform-anthropic/cc/claude-sonnet-4-20250514"
  );
});

test("T40: Windsurf card documents current official limitations honestly", () => {
  const windsurf = CLI_TOOLS.windsurf;
  assert.ok(windsurf, "Windsurf tool card must exist");
  assert.equal(windsurf.configType, "guide");

  const notesText = (windsurf.notes || [])
    .map((note) => note?.text || "")
    .join(" ")
    .toLowerCase();

  assert.match(notesText, /byok/);
  assert.match(notesText, /custom openai-compatible provider/);
});
