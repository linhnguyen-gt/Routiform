import test from "node:test";
import assert from "node:assert/strict";

import { NOUNS, HELP } from "../../bin/cli/dispatch.mjs";
import { resolvePorts, resolvePortsWithOverride } from "../../bin/cli/ports.mjs";
import { resolveDataDir, getDbPath } from "../../bin/cli/db-key.mjs";

test("CLI dispatch NOUNS contains all expected management nouns", () => {
  assert.ok(NOUNS.has("provider"), "should have provider");
  assert.ok(NOUNS.has("key"), "should have key");
  assert.ok(NOUNS.has("combo"), "should have combo");
  assert.ok(NOUNS.has("model"), "should have model");
  assert.ok(NOUNS.has("settings"), "should have settings");
  assert.ok(NOUNS.has("status"), "should have status");
  assert.ok(NOUNS.has("usage"), "should have usage");
  assert.ok(NOUNS.has("logs"), "should have logs");
});

test("CLI dispatch NOUNS does not contain server-start flags", () => {
  assert.equal(NOUNS.has("--mcp"), false);
  assert.equal(NOUNS.has("--port"), false);
  assert.equal(NOUNS.has("--help"), false);
});

test("CLI HELP includes all command names", () => {
  assert.ok(HELP.includes("routiform status"), "should include status");
  assert.ok(HELP.includes("routiform provider list"), "should include provider list");
  assert.ok(HELP.includes("routiform key create"), "should include key create");
  assert.ok(HELP.includes("routiform combo create"), "should include combo create");
  assert.ok(HELP.includes("routiform model list"), "should include model list");
  assert.ok(HELP.includes("routiform settings get"), "should include settings get");
  assert.ok(HELP.includes("routiform usage"), "should include usage");
  assert.ok(HELP.includes("routiform logs"), "should include logs");
});

test("CLI HELP mentions global flags", () => {
  assert.ok(HELP.includes("--json"), "should include --json");
  assert.ok(HELP.includes("--port"), "should include --port");
  assert.ok(HELP.includes("--api-key"), "should include --api-key");
  assert.ok(HELP.includes("--yes"), "should include --yes");
});

test("CLI HELP mentions Docker usage", () => {
  assert.ok(HELP.includes("docker exec"), "should mention docker exec");
});

test("CLI ports resolvePorts returns defaults", () => {
  const ports = resolvePorts({});
  assert.equal(ports.basePort, 20128);
  assert.equal(ports.dashboardPort, 20128);
  assert.equal(ports.apiPort, 20128);
});

test("CLI ports resolvePorts reads custom env", () => {
  const ports = resolvePorts({ PORT: "3000", API_PORT: "3001" });
  assert.equal(ports.basePort, 3000);
  assert.equal(ports.dashboardPort, 3000);
  assert.equal(ports.apiPort, 3001);
});

test("CLI ports resolvePortsWithOverride applies --port flag", () => {
  const ports = resolvePortsWithOverride({ port: 8080 });
  assert.equal(ports.dashboardPort, 8080);
});

test("CLI db-key resolveDataDir respects DATA_DIR env", () => {
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/test-routiform-cli";
  try {
    const dir = resolveDataDir();
    assert.ok(dir.includes("test-routiform-cli"), `dir should contain env path: ${dir}`);
  } finally {
    process.env.DATA_DIR = original;
  }
});

test("CLI db-key getDbPath appends storage.sqlite", () => {
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/test-routiform-cli";
  try {
    const path = getDbPath();
    assert.ok(path.endsWith("storage.sqlite"), `should end with storage.sqlite: ${path}`);
  } finally {
    process.env.DATA_DIR = original;
  }
});

test("CLI db-key readApiKeyFromDb returns null when DB doesn't exist", async () => {
  const { readApiKeyFromDb } = await import("../../bin/cli/db-key.mjs");
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/nonexistent-routiform-dir-12345";
  try {
    const key = await readApiKeyFromDb();
    assert.equal(key, null, "should return null when DB doesn't exist");
  } finally {
    process.env.DATA_DIR = original;
  }
});

test("CLI output printJson outputs valid JSON", async () => {
  const { printJson } = await import("../../bin/cli/output.mjs");
  const original = console.log;
  let captured = "";
  console.log = (s) => {
    captured = s;
  };
  printJson({ hello: "world" });
  console.log = original;
  assert.deepEqual(JSON.parse(captured), { hello: "world" });
});

test("CLI output printTable handles empty rows", async () => {
  const { printTable } = await import("../../bin/cli/output.mjs");
  const original = console.log;
  let captured = "";
  console.log = (s) => {
    captured = s;
  };
  printTable([], [{ key: "id", label: "ID", width: 10 }]);
  console.log = original;
  assert.ok(captured.includes("no results"), `should say "no results": ${captured}`);
});

test("CLI api-client exports get/post/del functions", async () => {
  const mod = await import("../../bin/cli/api-client.mjs");
  assert.equal(typeof mod.get, "function");
  assert.equal(typeof mod.post, "function");
  assert.equal(typeof mod.del, "function");
  assert.equal(typeof mod.checkServerReachable, "function");
});
