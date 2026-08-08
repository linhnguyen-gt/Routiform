/**
 * Guards the model ranking that combo quick templates and the auto-combo router share.
 *
 * Two defects motivated these tests, and both were invisible because nothing in the run
 * suite touched `getTaskFitness` at all:
 *
 *   1. FIRST-MATCH-WINS. The lookup returned the first pattern whose substring appeared in
 *      the id, so `gpt-4o-mini` matched `gpt-4o` and inherited the full model's score. On
 *      the "High availability" template that put GPT-4o mini level with Claude Sonnet 4.5
 *      at the top of the list.
 *   2. GEMINI IDS NEVER MATCHED. The only Gemini patterns were `gemini-pro` / `gemini-flash`,
 *      but Google versions its models `gemini-3-pro`, `gemini-2.5-pro`, so every one of them
 *      fell to the 0.5 neutral floor. At the floor, `combo-template-resolver` breaks ties by
 *      catalog position, which is what made "smart" ranking look arbitrary.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { findLongestMatch, getTaskFitness, getTaskTypes } =
  await import("../../open-sse/services/autoCombo/taskFitness.ts");
const { FITNESS_TABLE } = await import("../../open-sse/services/autoCombo/taskFitnessTable.ts");

const NEUTRAL = 0.5;

/**
 * The shipped tables list specific ids before their families, so a first-match scan would
 * pass every id-based assertion below by luck. This drives the matcher with the general
 * pattern deliberately placed FIRST — the only shape that separates the two algorithms.
 */
test("the matcher prefers the longest pattern regardless of key order", () => {
  const hostile = { "gpt-4o": 0.9, "gpt-4o-mini": 0.3, "gpt-4o-mini-audio": 0.1 };

  assert.equal(findLongestMatch("gpt-4o", hostile), 0.9);
  assert.equal(
    findLongestMatch("gpt-4o-mini", hostile),
    0.3,
    "a first-match scan would return gpt-4o's 0.9 here"
  );
  assert.equal(findLongestMatch("openai/gpt-4o-mini-audio", hostile), 0.1);
  assert.equal(findLongestMatch("claude-sonnet-4.5", hostile), null);
});

test("the longest matching pattern wins, so a specific id overrides its family", () => {
  const mini = getTaskFitness("gpt-4o-mini", "default");
  const full = getTaskFitness("gpt-4o", "default");

  assert.notEqual(mini, full, "gpt-4o-mini must not inherit gpt-4o's score");
  assert.ok(mini < full, `expected mini (${mini}) below full (${full})`);
});

test("a cheap small model never outranks a current flagship", () => {
  const cheap = getTaskFitness("openai/gpt-4o-mini", "default");
  for (const flagship of [
    "claude-sonnet-4.5",
    "claude-opus-4.5",
    "gpt-5.5",
    "gemini-3-pro",
    "deepseek-v4-pro",
  ]) {
    const score = getTaskFitness(flagship, "default");
    assert.ok(score > cheap, `${flagship} (${score}) must outrank gpt-4o-mini (${cheap})`);
  }
});

test("real Gemini ids score above the neutral floor in every table", () => {
  const geminiIds = [
    "gemini-3-pro",
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
  ];

  for (const id of geminiIds) {
    const score = getTaskFitness(id, "default");
    assert.ok(score > NEUTRAL, `${id} scored ${score}; the version-shaped pattern is missing`);
  }
});

test("gemini-2.5-flash-lite is ranked below gemini-2.5-flash, not equal to it", () => {
  const lite = getTaskFitness("google/gemini-2.5-flash-lite", "default");
  const flash = getTaskFitness("google/gemini-2.5-flash", "default");
  assert.ok(lite < flash, `lite (${lite}) must sit below flash (${flash})`);
});

test("an aggregator namespace does not change a model's score", () => {
  const pairs = [
    ["openai/gpt-4o-mini", "gpt-4o-mini"],
    ["anthropic/claude-sonnet-4-20250514", "claude-sonnet-4-20250514"],
    ["moonshotai/kimi-k2.5", "kimi-k2.5"],
    ["google/gemini-2.5-pro", "gemini-2.5-pro"],
  ];

  for (const [namespaced, bare] of pairs) {
    assert.equal(
      getTaskFitness(namespaced, "default"),
      getTaskFitness(bare, "default"),
      `${namespaced} and ${bare} must score the same`
    );
  }
});

test("current-generation ids the catalog actually ships are all scored", () => {
  // Ids taken verbatim from the static provider catalogs. Every one of these used to
  // land on the neutral floor, which is what collapsed fitness ranking into catalog order.
  const shipped = [
    "claude-haiku-4.5",
    "claude-sonnet-4.6",
    "claude-opus-4.8",
    "claude-opus-5",
    "gpt-5.4",
    "gpt-5.6-luna",
    "gpt-5.3-codex",
    "gpt-oss-120b",
    "openai/gpt-oss-120b",
    "kimi-k2.7-code",
    "moonshotai/kimi-k2.6",
    "z-ai/glm-5.2",
    "deepseek-ai/deepseek-v4-pro",
    "minimaxai/minimax-m3",
    "x-ai/grok-code-fast-1",
    "qwen/qwen3-coder",
  ];

  const unscored = shipped.filter((id) => getTaskFitness(id, "default") === NEUTRAL);
  assert.deepEqual(unscored, [], `these ship in a catalog but score neutral: ${unscored}`);
});

test("an unknown model still falls back to neutral rather than guessing", () => {
  assert.equal(getTaskFitness("totally-unknown-model", "default"), NEUTRAL);
  assert.equal(getTaskFitness("", "default"), NEUTRAL);
});

test("wildcard boosts still apply when nothing in the table matches", () => {
  const coder = getTaskFitness("some-coder-model", "coding");
  const plain = getTaskFitness("some-random-model", "coding");
  assert.ok(coder > plain, `coder (${coder}) must beat plain (${plain})`);
  assert.equal(plain, NEUTRAL);
});

test("an unrecognised task type falls back to the default table", () => {
  assert.equal(
    getTaskFitness("claude-sonnet-4.5", "no-such-task"),
    getTaskFitness("claude-sonnet-4.5", "default")
  );
});

test("every score is a probability and no table is empty", () => {
  for (const [taskType, table] of Object.entries(FITNESS_TABLE)) {
    const entries = Object.entries(table);
    assert.ok(entries.length > 0, `${taskType} table is empty`);
    for (const [pattern, score] of entries) {
      assert.ok(
        typeof score === "number" && score >= 0 && score <= 1,
        `${taskType}.${pattern} = ${score} is outside [0,1]`
      );
    }
  }
});

test("getTaskTypes lists the real task types and hides the default table", () => {
  const types = getTaskTypes();
  assert.ok(!types.includes("default"));
  for (const expected of ["coding", "review", "planning", "analysis"]) {
    assert.ok(types.includes(expected), `missing task type: ${expected}`);
  }
});
