/**
 * Where an Oh My Pi config write is allowed to land.
 *
 * omp accepts two spellings of each config file and loads whichever exists first, and it
 * migrates its legacy JSON files only while neither spelling exists. Writing the `.yml`
 * name unconditionally would therefore shadow a `.yaml` user's providers and settings, and
 * would cancel the one-time migration for a legacy user — both silently, and neither
 * undone by Reset. These tests pin the resolution that avoids that.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const { resolveOmpWritePaths } = await import("../../src/shared/services/cliRuntime.ts");

const withAgentDir = async (files, run) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-paths-"));
  const agentDir = path.join(root, "agent");
  await fs.mkdir(agentDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(path.join(agentDir, name), body, "utf-8");
  }
  try {
    return await run(await resolveOmpWritePaths({ PI_CODING_AGENT_DIR: agentDir }, root), agentDir);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

test("omp paths: an empty agent dir gets the .yml spelling omp itself would create", () =>
  withAgentDir({}, (paths, dir) => {
    assert.equal(paths.models, path.join(dir, "models.yml"));
    assert.equal(paths.config, path.join(dir, "config.yml"));
    assert.equal(paths.legacyModels, null);
    assert.equal(paths.blocksSettingsMigration, false);
  }));

test("omp paths: an existing .yaml is written in place, never shadowed by a new .yml", () =>
  withAgentDir(
    { "models.yaml": "providers: {}\n", "config.yaml": "modelRoles: {}\n" },
    (paths, dir) => {
      assert.equal(paths.models, path.join(dir, "models.yaml"));
      assert.equal(paths.config, path.join(dir, "config.yaml"));
    }
  ));

test("omp paths: .yml wins over .yaml when both exist, matching omp's precedence", () =>
  withAgentDir(
    { "models.yml": "providers: {}\n", "models.yaml": "providers: {}\n" },
    (paths, dir) => {
      assert.equal(paths.models, path.join(dir, "models.yml"));
    }
  ));

test("omp paths: a legacy models.json is carried forward, not stranded", () =>
  withAgentDir({ "models.json": '{"providers":{}}' }, (paths, dir) => {
    // omp would have migrated this file into models.yml on its own first run.
    assert.equal(paths.legacyModels, path.join(dir, "models.json"));
    assert.equal(paths.models, path.join(dir, "models.yml"));
  }));

test("omp paths: a legacy models.json is ignored once a YAML file exists", () =>
  withAgentDir({ "models.json": '{"providers":{}}', "models.yml": "providers: {}\n" }, (paths) => {
    assert.equal(paths.legacyModels, null);
  }));

test("omp paths: an unmigrated settings.json blocks the config.yml write", () =>
  withAgentDir({ "settings.json": "{}" }, (paths) => {
    // Creating config.yml here would cancel omp's settings.json + agent.db migration.
    assert.equal(paths.blocksSettingsMigration, true);
  }));

test("omp paths: settings.json is harmless once the migration has already run", () =>
  withAgentDir({ "settings.json": "{}", "config.yaml": "modelRoles: {}\n" }, (paths) => {
    assert.equal(paths.blocksSettingsMigration, false);
  }));

test("omp paths: a rejected PI_CODING_AGENT_DIR falls back under the home dir", async () => {
  const paths = await resolveOmpWritePaths({ PI_CODING_AGENT_DIR: "../escape" }, "/home/someone");
  assert.equal(paths.dir, path.join("/home/someone", ".omp", "agent"));
});
