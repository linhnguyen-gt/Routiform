import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static coverage assertion for the host-capability route set.
 *
 * `verifyAuth` in the middleware accepts a Bearer gateway API key — the kind handed to Cursor,
 * Cline, or any `/v1` consumer. For a route that spawns a process, writes host configuration, or
 * hands out the database, that is the wrong bar: `isHostSecretAuthenticated` requires a dashboard
 * session (or same-origin on a passwordless install) instead.
 *
 * Two assertions here, and the second is the one that survives contact with future code:
 *   1. every route file below guards every exported handler;
 *   2. every route file in the tree that *looks* like it touches host capability is either in the
 *      guarded list or in the exclusion list with a stated reason.
 *
 * So a new spawn route added later without a guard fails this test rather than shipping open.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API_ROOT = join(REPO_ROOT, "src/app/api");

/** Route files that must guard every exported handler with `isHostSecretAuthenticated`. */
export const HOST_SECRET_ROUTES = [
  // Persists a versionCommand this host then executes on every cache refresh.
  "acp/agents/route.ts",

  // Write CLI configuration under the operator's home directory.
  "cli-tools/claude-settings/route.ts",
  "cli-tools/cline-settings/route.ts",
  "cli-tools/codex-profiles/route.ts",
  "cli-tools/codex-settings/route.ts",
  "cli-tools/cowork-settings/route.ts",
  "cli-tools/droid-settings/route.ts",
  "cli-tools/guide-settings/[toolId]/route.ts",
  "cli-tools/hermes-settings/route.ts",
  "cli-tools/kilo-settings/route.ts",
  "cli-tools/openclaw-settings/route.ts",

  // Restore and delete snapshots of that same host configuration.
  "cli-tools/backups/route.ts",

  // Control host tooling and the MITM proxy.
  "cli-tools/antigravity-mitm/route.ts",
  "cli-tools/antigravity-mitm/alias/route.ts",
  "cli-tools/runtime/[toolId]/route.ts",
  "cli-tools/openclaw/auto-order/route.ts",

  // Install and control host processes.
  "version-manager/install/route.ts",
  "version-manager/start/route.ts",
  "version-manager/stop/route.ts",
  "version-manager/restart/route.ts",
  "restart/route.ts",

  // Spawns the cloudflared binary.
  "tunnels/cloudflared/route.ts",

  // Host filesystem access to the database, in both directions.
  "db-backups/route.ts",
  "db-backups/export/route.ts",
  "db-backups/exportAll/route.ts",
  "db-backups/import/route.ts",
  "db-backups/importAll/route.ts",

  // Reads host credentials off disk / writes them back.
  "sync/cloud/route.ts",
  "oauth/cursor/auto-import/route.ts",
  "oauth/devin/auto-import/route.ts",
  "oauth/kiro/auto-import/route.ts",
  "providers/[id]/codex-auth/apply-local/route.ts",
];

/**
 * Route files the capability scan flags but that are deliberately not in the set, each with the
 * reason. Being on this list is a claim a reviewer can check, not a way to opt out quietly.
 */
export const EXCLUDED_ROUTES = {
  "cli-tools/status/route.ts": "read-only: reads config paths to report configured/not-configured",
  "providers/[id]/test/route.ts": "read-only: calls getCliRuntimeStatus for a capability hint",
  "translator/save/route.ts":
    "writes an allowlisted debug artifact under process.cwd()/logs, never the home directory",
  "system/version/route.ts":
    "split guard: POST launches an installer and uses isHostSecretAuthenticated; GET only reports versions",
};

// Substrings that mark a route as touching host capability, directly or through a helper module.
const CAPABILITY_MARKERS = [
  "spawn",
  "execFile",
  "execSync",
  "homedir",
  "writeFile",
  "cliRuntime",
  "backupService",
  "versionManager/processManager",
  "cloudflaredTunnel",
  "acp/registry",
];

const HANDLER_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;

function readRoute(relative) {
  return readFileSync(join(API_ROOT, relative), "utf-8");
}

function walkRouteFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRouteFiles(full, acc);
    else if (entry === "route.ts" || entry === "route.js") acc.push(full);
  }
  return acc;
}

for (const relative of HOST_SECRET_ROUTES) {
  test(`${relative} guards every handler with isHostSecretAuthenticated`, () => {
    const source = readRoute(relative);
    const handlers = [...source.matchAll(HANDLER_RE)].map((m) => m[1]);
    assert.ok(handlers.length > 0, `no exported handlers found in ${relative}`);

    const guards = source.split("isHostSecretAuthenticated(").length - 1;
    assert.ok(
      guards >= handlers.length,
      `${relative}: ${handlers.length} handlers (${handlers.join(", ")}) but only ${guards} isHostSecretAuthenticated call(s)`
    );
  });
}

test("every host-capability route is guarded or explicitly excluded", () => {
  const guarded = new Set(HOST_SECRET_ROUTES);
  const unclassified = [];

  for (const full of walkRouteFiles(API_ROOT)) {
    const relative = full.slice(API_ROOT.length + 1);
    if (guarded.has(relative) || relative in EXCLUDED_ROUTES) continue;

    const source = readFileSync(full, "utf-8");
    if (CAPABILITY_MARKERS.some((marker) => source.includes(marker))) {
      unclassified.push(relative);
    }
  }

  assert.deepEqual(
    unclassified,
    [],
    `these routes touch host capability but are neither guarded nor excluded:\n  ${unclassified.join("\n  ")}\n` +
      "Add isHostSecretAuthenticated and list it in HOST_SECRET_ROUTES, or add it to EXCLUDED_ROUTES with a reason."
  );
});

test("the exclusion list stays honest about the routes it names", () => {
  for (const relative of Object.keys(EXCLUDED_ROUTES)) {
    assert.doesNotThrow(
      () => readRoute(relative),
      `${relative} in EXCLUDED_ROUTES no longer exists`
    );
  }
});
