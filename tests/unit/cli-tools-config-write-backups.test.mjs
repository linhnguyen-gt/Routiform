/**
 * Every write to a CLI tool's config file takes a backup first.
 *
 * These files belong to the user — their own providers, model roles, permission
 * rules and hooks live alongside the Routiform block. Save handlers already took a
 * backup; the reset handlers, which are the destructive half, did not. A Reset click
 * removed `~/.omp/agent/models.yml` with no copy kept anywhere.
 *
 * Asserted against the source rather than by driving the route, because the point is
 * that a *new* handler cannot be added without one. A per-handler test would only
 * cover the handlers someone remembered to write a test for.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROUTE = "src/app/api/cli-tools/guide-settings/[toolId]/route.ts";

/** How far back a `createBackup` may sit and still plausibly guard this write. */
const LOOKBACK_LINES = 20;

const lines = readFileSync(ROUTE, "utf-8").split("\n");

const mutations = lines
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => /\bfs\.(writeFile|unlink|rm)\(/.test(line));

test("the route still performs config writes", () => {
  // A rename or a refactor that moves these out would otherwise make the guard below
  // pass by finding nothing to check.
  assert.ok(mutations.length >= 10, `found only ${mutations.length} write sites`);
});

test("every config write is preceded by a backup", () => {
  const unguarded = mutations.filter(({ number }) => {
    const window = lines.slice(Math.max(0, number - 1 - LOOKBACK_LINES), number - 1);
    return !window.some((line) => line.includes("createBackup("));
  });

  assert.deepEqual(
    unguarded.map(({ number, line }) => `${number}: ${line.trim()}`),
    [],
    "these writes would destroy a user config with no copy kept"
  );
});
