import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `getLatestModelOutcomes` reads back what earlier requests already recorded, so the
 * provider page can restore its per-model pass/fail marks instead of showing every model as
 * untested after a reload.
 *
 * It runs against a throwaway database built by the real migrations — a hand-written
 * `usage_history` drifts from production and the migration runner rejects it outright.
 */

const dir = mkdtempSync(join(tmpdir(), "routiform-availability-"));
process.env.DATA_DIR = dir;

const { getDbInstance } = await import("../../src/lib/db/core.ts");
const { getLatestModelOutcomes } = await import("../../src/lib/db/modelAvailability.ts");

const db = getDbInstance();
const insert = db.prepare(
  "INSERT INTO usage_history (provider, model, success, error_code, timestamp) VALUES (?, ?, ?, ?, ?)"
);
// Oldest first: claude-haiku-4.5 worked, then stopped. The newest row must win.
insert.run("github", "claude-haiku-4.5", 1, null, "2026-05-26T02:11:37.211Z");
insert.run("github", "claude-haiku-4.5", 0, "model_unavailable", "2026-07-12T14:36:30.640Z");
insert.run("github", "gpt-4.1", 1, null, "2026-07-14T07:17:36.353Z");
insert.run("github", "gpt-5.5", 0, "model_unavailable", "2026-08-05T08:05:03.074Z");
insert.run("antigravity", "gemini-3.6-flash-low", 1, null, "2026-08-05T08:30:00.000Z");
insert.run("github", null, 1, null, "2026-08-05T09:00:00.000Z");

test("reports the newest verdict per model, not the first or the best", () => {
  const outcomes = getLatestModelOutcomes("github");

  // The model succeeded in May and failed in July. Reporting "ok" because it once worked
  // would tell the user a model is available when every call now fails.
  assert.equal(outcomes["claude-haiku-4.5"].status, "error");
  assert.equal(outcomes["claude-haiku-4.5"].errorCode, "model_unavailable");
  assert.equal(outcomes["claude-haiku-4.5"].checkedAt, "2026-07-12T14:36:30.640Z");

  assert.equal(outcomes["gpt-4.1"].status, "ok");
  assert.equal(outcomes["gpt-4.1"].errorCode, undefined, "a success carries no error code");
});

test("scopes to the requested provider", () => {
  const outcomes = getLatestModelOutcomes("github");
  assert.equal(outcomes["gemini-3.6-flash-low"], undefined);

  const antigravity = getLatestModelOutcomes("antigravity");
  assert.equal(antigravity["gemini-3.6-flash-low"].status, "ok");
  assert.equal(antigravity["gpt-4.1"], undefined);
});

test("rows without a model id are skipped rather than keyed under null", () => {
  const outcomes = getLatestModelOutcomes("github");
  assert.ok(!("null" in outcomes));
  assert.ok(!("" in outcomes));
  assert.deepEqual(Object.keys(outcomes).sort(), ["claude-haiku-4.5", "gpt-4.1", "gpt-5.5"]);
});

test("an unknown provider yields an empty map, not a throw", () => {
  assert.deepEqual(getLatestModelOutcomes("does-not-exist"), {});
  assert.deepEqual(getLatestModelOutcomes(""), {});
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
