import test from "node:test";
import assert from "node:assert/strict";

import {
  validateComboModels,
  __PASSTHROUGH_UNION_FOR_TESTS as PASSTHROUGH_UNION,
} from "../../src/shared/validation/combo-model-validation.ts";

const base = {
  knownComboNames: new Set(),
  knownModelAliases: new Set(),
  knownNodePrefixes: new Set(),
  stripModelPrefix: false,
};

const run = (models, overrides = {}) =>
  validateComboModels({ ...base, ...overrides, models: Array.isArray(models) ? models : [models] });

const verdict = (models, overrides) => {
  const result = run(models, overrides);
  if (result.errors.length) return "error";
  if (result.warnings.length) return "warning";
  return "clean";
};

// ──────────────── PASSTHROUGH_UNION: two sources, neither a superset ────────────────

test("PASSTHROUGH_UNION is the measured 24-key union of both sources", () => {
  assert.strictEqual(PASSTHROUGH_UNION.size, 24);
  // Collapsing to one source drops exactly these two rows.
  assert.ok(PASSTHROUGH_UNION.has("antigravity"), "REGISTRY-only member, no alias");
  assert.ok(PASSTHROUGH_UNION.has("novita"), "AI_PROVIDERS-only member");
  // Aliases are seeded too — combo entries may carry either spelling.
  assert.ok(PASSTHROUGH_UNION.has("kg"), "kilo-gateway alias");
  assert.ok(PASSTHROUGH_UNION.has("dv"), "devin alias");
});

// ──────────────── The decision cascade ────────────────

test("a valid provider/model with a slash-bearing model id is clean", () => {
  assert.strictEqual(verdict("nvidia/meta/llama-3.3-70b-instruct"), "clean");
});

test("an unresolvable provider ref is a hard error", () => {
  assert.strictEqual(verdict("foo/bar/baz"), "error");
  assert.strictEqual(verdict("if/kimi-k2-thinking"), "error", "iflow is not a provider");
});

test("an entry already stored on the combo downgrades to a warning", () => {
  assert.strictEqual(
    verdict("if/kimi-k2-thinking", { existingModels: new Set(["if/kimi-k2-thinking"]) }),
    "warning"
  );
});

test("stripModelPrefix downgrades the hard error to a warning", () => {
  assert.strictEqual(verdict("foo/bar/baz", { stripModelPrefix: true }), "warning");
});

test("a custom provider-node prefix is clean, and unknown without the node", () => {
  assert.strictEqual(verdict("mynode/gpt-4o", { knownNodePrefixes: new Set(["mynode"]) }), "clean");
  assert.strictEqual(verdict("mynode/gpt-4o"), "error");
});

test("combo names are matched against the full entry, before any split", () => {
  assert.strictEqual(verdict("team/fast", { knownComboNames: new Set(["team/fast"]) }), "clean");
  assert.strictEqual(verdict("my-combo", { knownComboNames: new Set(["my-combo"]) }), "clean");
});

test("model aliases are clean, including one containing a slash", () => {
  assert.strictEqual(
    verdict("some-alias", { knownModelAliases: new Set(["some-alias"]) }),
    "clean"
  );
  assert.strictEqual(
    verdict("weird/alias", { knownModelAliases: new Set(["weird/alias"]) }),
    "clean"
  );
});

test("a slash-less entry never errors, even when nothing knows it", () => {
  assert.strictEqual(verdict("some-alias"), "clean");
});

test("object-form entries behave identically to string form", () => {
  assert.strictEqual(verdict({ model: "foo/bar/baz", weight: 50 }), "error");
  assert.strictEqual(verdict({ model: "nvidia/meta/llama-3.3-70b-instruct", weight: 50 }), "clean");
});

// ──────────────── BLK-3a: never warn on the app's own picker output ────────────────

// Every row measured against the real wrapper. Four of these WARNED before the fix.
const PICKER_OUTPUT_ROWS = [
  ["antigravity/gemini-3-pro-high", "PASSTHROUGH_UNION (REGISTRY-only member)"],
  ["gemini/gemini-3-pro", "catalog absent → unknown"],
  ["claude/claude-sonnet-5", "catalog absent → unknown"],
  ["cliproxyapi/x", "catalog absent → unknown"],
  ["openrouter/anything/at-all", "WILDCARD_MODEL_PROVIDERS"],
];

for (const [entry, rule] of PICKER_OUTPUT_ROWS) {
  test(`"${entry}" is clean — ${rule}`, () => {
    assert.strictEqual(verdict(entry), "clean");
  });
}

test("passthrough via alias is clean for both spellings", () => {
  assert.strictEqual(verdict("kg/whatever"), "clean");
  assert.strictEqual(verdict("dv/whatever"), "clean");
});

// ──────────────── ...but a real mistake still warns ────────────────

test("a present catalog missing the model id warns", () => {
  assert.strictEqual(verdict("groq/llama-3.1-70b-versatile"), "warning", "version typo");
  assert.strictEqual(verdict("groq/totally-made-up"), "warning");
});

test("Kiro's dash-to-dot branch keeps a real model clean and still catches a fake one", () => {
  assert.strictEqual(verdict("kr/claude-sonnet-4.5"), "clean");
  assert.strictEqual(verdict("kr/claude-sonnet-9.9"), "warning");
});

// ──────────────── Id/alias symmetry: fails under a one-key catalog lookup ────────────────

test("both spellings of a provider agree, for a real and a fake model", () => {
  assert.strictEqual(verdict("deepseek/deepseek-chat"), "clean");
  assert.strictEqual(verdict("ds/deepseek-chat"), "clean");
  assert.strictEqual(verdict("deepseek/made-up-xyz"), "warning", "one-key lookup misses this");
  assert.strictEqual(verdict("ds/made-up-xyz"), "warning");
});

// ──────────────── Fail-open on a failed read ────────────────

test("a failed node read skips validation entirely instead of rejecting", () => {
  const result = run("foo/bar/baz", { knownNodePrefixes: null });
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

test("a failed alias read skips validation entirely", () => {
  const result = run("foo/bar/baz", { knownModelAliases: null });
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

// ──────────────── Output shape ────────────────

test("echoed strings are capped, and warned providers are deduped in order", () => {
  const long = `groq/${"x".repeat(400)}`;
  const result = run([long, "groq/totally-made-up", "deepseek/made-up-xyz"]);
  assert.strictEqual(result.warnings.length, 3);
  for (const warning of result.warnings) assert.ok(warning.length <= 201, warning.length);
  assert.deepStrictEqual(result.warnedProviders, ["groq", "deepseek"]);
});

test("an empty or absent model list produces nothing", () => {
  assert.deepStrictEqual(run([]).errors, []);
  assert.deepStrictEqual(validateComboModels({ ...base, models: undefined }).warnings, []);
});
