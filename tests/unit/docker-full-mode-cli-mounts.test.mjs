/**
 * Full-mode Docker has to mount every config directory the CLI runtime reads.
 *
 * In full mode the container runs with CLI_CONFIG_HOME=/host-home, so a tool whose
 * directory is not mounted reads an empty path: its card reports not_configured however
 * the host is set up, and Save Config writes into the container's own filesystem, where
 * the CLI on the host will never see it. Nothing linked the mount list to the registry, so
 * adding a tool silently skipped it — twice.
 *
 * The rule checked here: for every config path the runtime resolves under $HOME, the
 * compose file mounts that directory or one of its ancestors.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMPOSE_FILE = "docker-compose.full.yml";

const { CLI_TOOL_IDS, getCliConfigPaths } = await import("../../src/shared/services/cliRuntime.ts");

const toPosix = (value) => value.split(path.sep).join("/");

/** Every `- ${HOME}/<dir>:<target>` line, as a HOME-relative directory. */
const mountedDirs = () => {
  const compose = fs.readFileSync(COMPOSE_FILE, "utf-8");
  return new Set(
    [...compose.matchAll(/^\s*-\s*\$\{HOME\}\/([^:]+):/gm)].map((match) =>
      match[1].trim().replace(/\/+$/, "")
    )
  );
};

/** Every HOME-relative directory the runtime would read a config file from. */
const requiredDirs = () => {
  const home = os.homedir();
  const required = new Map();

  for (const toolId of CLI_TOOL_IDS) {
    for (const configPath of Object.values(getCliConfigPaths(toolId) || {})) {
      const relative = path.relative(home, String(configPath));
      // A path outside $HOME cannot be expressed as a ${HOME}/... mount.
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
      required.set(toPosix(path.dirname(relative)), toolId);
    }
  }

  return required;
};

const isCoveredBy = (mounts, dir) =>
  dir
    .split("/")
    .some((_, index, parts) => mounts.has(parts.slice(0, parts.length - index).join("/")));

test("full-mode compose mounts a config directory for every tool in the runtime registry", () => {
  const mounts = mountedDirs();
  assert.ok(mounts.size > 0, `no \${HOME} mounts parsed out of ${COMPOSE_FILE}`);

  const missing = [...requiredDirs()]
    .filter(([dir]) => !isCoveredBy(mounts, dir))
    .map(([dir, toolId]) => `${toolId} -> \${HOME}/${dir}`);

  assert.deepEqual(
    missing,
    [],
    `${COMPOSE_FILE} does not mount these config directories, so full mode cannot see them:\n` +
      missing.join("\n")
  );
});

test("every mounted directory is exposed at both /host-home and /root", () => {
  const compose = fs.readFileSync(COMPOSE_FILE, "utf-8");
  const targetsFor = (prefix) =>
    new Set(
      [...compose.matchAll(new RegExp(`^\\s*-\\s*\\$\\{HOME\\}/([^:]+):${prefix}/`, "gm"))].map(
        (match) => match[1].trim()
      )
    );

  // The CLI runtime reads through CLI_CONFIG_HOME=/host-home; a CLI spawned inside the
  // container reads $HOME=/root. A directory mounted at only one of them is half-wired.
  const hostHome = targetsFor("/host-home");
  const rootHome = targetsFor("/root");
  const oneSided = [...hostHome].filter((dir) => !rootHome.has(dir));

  assert.deepEqual(oneSided, [], `mounted at /host-home but not /root: ${oneSided.join(", ")}`);
});
