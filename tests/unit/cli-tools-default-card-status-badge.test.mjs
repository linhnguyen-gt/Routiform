/**
 * What a CLI tool card header is allowed to show.
 *
 * DefaultToolCard renders every tool without a dedicated card — grok, kimi, omp, qwen,
 * opencode, continue, cursor, windsurf. It used to return a hardcoded "Guide" pill for
 * anything with configType "guide" and never rendered CliStatusBadge, so a tool the API
 * reported as configured showed nothing of the sort: the status was computed correctly
 * and thrown away at the last step.
 *
 * The header now carries exactly one badge, the shared CliStatusBadge, matching the eight
 * dedicated cards. Install state is not duplicated there — the expanded card already
 * reports installed/runnable/commandPath from runtimeStatus.
 *
 * These are source assertions rather than DOM assertions because the repo's unit suite is
 * node:test with no renderer; they pin the lines that regressed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CARD = path.join(
  process.cwd(),
  "src/app/(dashboard)/dashboard/cli-tools/components/DefaultToolCard.tsx"
);
const source = fs.readFileSync(CARD, "utf-8");

test("the default card renders the shared config-status badge", () => {
  assert.match(source, /import CliStatusBadge from "\.\/CliStatusBadge"/);
  assert.match(source, /<CliStatusBadge\b/);
});

test("the badge is given what it needs to show configured and when", () => {
  const usage = source.match(/<CliStatusBadge[\s\S]{0,200}?\/>/);
  assert.ok(usage, "CliStatusBadge is rendered");
  assert.match(usage[0], /batchStatus=\{batchStatus\}/);
  assert.match(usage[0], /lastConfiguredAt=\{lastConfiguredAt\}/);
});

test("lastConfiguredAt is accepted as a prop, not silently dropped", () => {
  assert.match(source, /lastConfiguredAt = null,/);
});

test("the header carries one badge, not a second install pill beside it", () => {
  // These labels belonged to the removed pill. The expanded card still reports install
  // state from runtimeStatus, so nothing is lost by keeping them out of the header.
  for (const label of ['t("detected")', 't("guide")', 't("notInstalled")', 't("notReady")']) {
    assert.ok(!source.includes(label), `header must not reintroduce ${label}`);
  }
  assert.equal(source.match(/<CliStatusBadge\b/g)?.length, 1);
});
