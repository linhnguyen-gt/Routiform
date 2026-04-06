import { describe, it } from "node:test";
import assert from "node:assert/strict";

const autoUpdate = await import("../../src/lib/system/autoUpdate.ts");

describe("getAutoUpdateConfig", () => {
  it("defaults to npm or source mode locally", () => {
    const config = autoUpdate.getAutoUpdateConfig({ DATA_DIR: "/tmp/routiform" });
    assert.ok(config.mode === "npm" || config.mode === "source");
    assert.equal(config.repoDir, "/workspace/routiform");
    assert.equal(config.composeProfile, "cli");
  });

  it("reads docker-compose settings from env", () => {
    const config = autoUpdate.getAutoUpdateConfig({
      DATA_DIR: "/tmp/custom-data",
      AUTO_UPDATE_MODE: "docker-compose",
      AUTO_UPDATE_REPO_DIR: "/srv/routiform",
      AUTO_UPDATE_COMPOSE_FILE: "/srv/routiform/docker-compose.yml",
      AUTO_UPDATE_COMPOSE_PROFILE: "base",
      AUTO_UPDATE_SERVICE: "routiform-base",
      AUTO_UPDATE_GIT_REMOTE: "upstream",
      AUTO_UPDATE_PATCH_COMMITS: "abc123 def456,ghi789",
      AUTO_UPDATE_LOG_PATH: "/tmp/update.log",
    });

    assert.equal(config.mode, "docker-compose");
    assert.equal(config.repoDir, "/srv/routiform");
    assert.equal(config.composeFile, "/srv/routiform/docker-compose.yml");
    assert.equal(config.composeProfile, "base");
    assert.equal(config.composeService, "routiform-base");
    assert.equal(config.gitRemote, "upstream");
    assert.deepEqual(config.patchCommits, ["abc123", "def456", "ghi789"]);
    assert.equal(config.logPath, "/tmp/update.log");
  });
});

describe("validateAutoUpdateRuntime", () => {
  it("reports missing docker socket for docker-compose mode", async () => {
    const config = autoUpdate.getAutoUpdateConfig({
      AUTO_UPDATE_MODE: "docker-compose",
      AUTO_UPDATE_REPO_DIR: "/repo",
      AUTO_UPDATE_COMPOSE_FILE: "/repo/docker-compose.yml",
    });

    const result = await autoUpdate.validateAutoUpdateRuntime(
      config,
      async () => ({ stdout: "git version 2.0.0", stderr: "" }),
      async (targetPath) => targetPath !== "/var/run/docker.sock"
    );

    assert.equal(result.supported, false);
    assert.match(result.reason, /Docker socket/);
  });

  it("detects docker-compose command availability", async () => {
    const config = autoUpdate.getAutoUpdateConfig({
      AUTO_UPDATE_MODE: "docker-compose",
      AUTO_UPDATE_REPO_DIR: "/repo",
      AUTO_UPDATE_COMPOSE_FILE: "/repo/docker-compose.yml",
    });

    const result = await autoUpdate.validateAutoUpdateRuntime(
      config,
      async (file, args) => {
        if (file === "git") return { stdout: "git version 2.0.0", stderr: "" };
        if (file === "docker" && args?.[0] === "compose") {
          return { stdout: "Docker Compose version v2.0.0", stderr: "" };
        }
        throw new Error(`unexpected command: ${file}`);
      },
      async () => true
    );

    assert.equal(result.supported, true);
    assert.equal(result.composeCommand, "docker compose");
  });
});

describe("buildDockerComposeUpdateScript", () => {
  it("includes git checkout and compose rebuild steps", () => {
    const config = autoUpdate.getAutoUpdateConfig({
      AUTO_UPDATE_MODE: "docker-compose",
      AUTO_UPDATE_REPO_DIR: "/repo",
      AUTO_UPDATE_COMPOSE_FILE: "/repo/docker-compose.yml",
      AUTO_UPDATE_COMPOSE_PROFILE: "cli",
      AUTO_UPDATE_SERVICE: "routiform-cli",
      AUTO_UPDATE_GIT_REMOTE: "origin",
      AUTO_UPDATE_PATCH_COMMITS: "1501a87 e569e1c",
    });

    const script = autoUpdate.buildDockerComposeUpdateScript({
      latest: "3.2.6",
      config,
      composeCommand: "docker compose",
    });

    assert.match(script, /git fetch --tags/);
    assert.match(script, /git config --global --add safe\.directory/);
    assert.match(script, /git checkout -B "autoupdate\/\$\{TARGET_TAG#v\}" "\$TARGET_TAG"/);
    assert.match(script, /git cherry-pick --keep-redundant-commits '1501a87' 'e569e1c'/);
    assert.match(script, /docker compose -f "\$COMPOSE_FILE" up -d --build "\$SERVICE"/);
  });
});
