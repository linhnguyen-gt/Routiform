import test from "node:test";
import assert from "node:assert/strict";

/**
 * The fidelity gate and the completion signals behind it.
 *
 * This is the machinery that decides whether a lossy engine ships default-on, so its failure modes
 * are worth more than its happy paths: a gate that passes when it should not is worse than no gate,
 * because it certifies rather than merely omitting.
 */

const {
  evaluateGate,
  describeVerdict,
  OVERALL_THRESHOLD,
  PER_FAMILY_THRESHOLD,
  MIN_RUNS_PER_FAMILY,
} = await import("../../src/lib/evals/compression/threshold.ts");

const { evaluateAll, evaluatePassCondition, MAX_ANSWER_CONTAINS_SHARE } =
  await import("../../src/lib/evals/compression/pass-conditions.ts");

const family = (name, basePassed, compPassed, runs = 30) => ({
  family: name,
  baselinePassed: basePassed,
  baselineRuns: runs,
  compressedPassed: compPassed,
  compressedRuns: runs,
});

// ── the gate ─────────────────────────────────────────────────────────────────

test("passes when every family holds at or above the thresholds", () => {
  const verdict = evaluateGate([
    family("coding-agent-tool-loop", 30, 29),
    family("code-review", 27, 26),
    family("long-rag-context", 30, 29),
    family("multilingual-chat", 28, 27),
  ]);
  assert.equal(verdict.passed, true, describeVerdict(verdict));
  assert.ok(verdict.overallRatio >= OVERALL_THRESHOLD);
});

test("one weak family fails the gate even when the aggregate looks healthy", () => {
  // The reason the per-family floor exists: code-review is where lossy engines are most dangerous
  // and the family most easily drowned by three healthier ones.
  const verdict = evaluateGate([
    family("coding-agent-tool-loop", 30, 30),
    family("code-review", 28, 20),
    family("long-rag-context", 30, 30),
    family("multilingual-chat", 30, 30),
  ]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.some((f) => f.startsWith("code-review")));
});

test("the ratio is measured against the OBSERVED baseline, not against 100%", () => {
  // A task the model fails uncompressed is not evidence against compression. Baseline 20/30 and
  // compressed 20/30 is a perfect result, not a 67% one.
  const verdict = evaluateGate([
    family("coding-agent-tool-loop", 20, 20),
    family("code-review", 20, 20),
  ]);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.overallRatio, 1);
});

test("a family whose baseline never passed cannot certify anything", () => {
  // 0/0 treated as 1.0 would let a completely broken family wave an engine through.
  const verdict = evaluateGate([family("coding-agent-tool-loop", 0, 0)]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.some((f) => /measures nothing/.test(f)));
});

test("too few runs is a failure, not a pass on thin evidence", () => {
  const verdict = evaluateGate([family("coding-agent-tool-loop", 5, 5, 5)]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.some((f) => /too few runs/.test(f)));
  assert.ok(MIN_RUNS_PER_FAMILY >= 30);
});

test("an empty measurement fails rather than vacuously passing", () => {
  const verdict = evaluateGate([]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures[0].includes("nothing was demonstrated"));
});

test("the aggregate weights by runs, so a tiny family cannot swing it", () => {
  // Averaging family ratios would let a 30-run family and a 300-run family count the same.
  const verdict = evaluateGate([
    {
      family: "big",
      baselinePassed: 300,
      baselineRuns: 300,
      compressedPassed: 300,
      compressedRuns: 300,
    },
    {
      family: "small",
      baselinePassed: 30,
      baselineRuns: 30,
      compressedPassed: 28,
      compressedRuns: 30,
    },
  ]);
  assert.equal(verdict.passed, true);
  assert.ok(verdict.overallRatio > 0.99);
});

test("a borderline result lands on the documented side of the line", () => {
  const justUnder = evaluateGate([family("f", 30, 28)]); // 93.3%
  assert.equal(justUnder.passed, false);
  const justOver = evaluateGate([family("f", 30, 29)]); // 96.7%
  assert.equal(justOver.passed, true);
  assert.equal(PER_FAMILY_THRESHOLD, 0.9);
  assert.equal(OVERALL_THRESHOLD, 0.95);
});

test("the verdict says why, in a form a log can carry", () => {
  const verdict = evaluateGate([family("code-review", 30, 10)]);
  const summary = describeVerdict(verdict);
  assert.ok(summary.startsWith("FAIL"));
  assert.ok(summary.includes("code-review"));
});

// ── pass conditions ──────────────────────────────────────────────────────────

test("tests-pass requires the command to have actually run", () => {
  const condition = { kind: "tests-pass", command: "npm test" };
  assert.equal(evaluatePassCondition(condition, { testExitCode: 0 }).passed, true);
  assert.equal(evaluatePassCondition(condition, { testExitCode: 1 }).passed, false);
  // "we did not check" must never read as success.
  const unrun = evaluatePassCondition(condition, {});
  assert.equal(unrun.passed, false);
  assert.match(unrun.reason, /never run/);
});

test("file-edited checks both presence and absence", () => {
  const condition = {
    kind: "file-edited",
    path: "src/a.ts",
    mustContain: ["export function fixed"],
    mustNotContain: ["TODO"],
  };
  assert.equal(
    evaluatePassCondition(condition, { files: { "src/a.ts": "export function fixed() {}" } })
      .passed,
    true
  );
  assert.equal(
    evaluatePassCondition(condition, {
      files: { "src/a.ts": "export function fixed() {} // TODO" },
    }).passed,
    false
  );
  assert.equal(evaluatePassCondition(condition, { files: {} }).passed, false);
});

test("tool-called checks the arguments, not just the name", () => {
  const condition = {
    kind: "tool-called",
    name: "edit_file",
    argumentsInclude: { path: "src/parser.ts" },
  };
  assert.equal(
    evaluatePassCondition(condition, {
      toolCalls: [{ name: "edit_file", arguments: { path: "src/parser.ts" } }],
    }).passed,
    true
  );
  // The exact failure a similarity score cannot see: right tool, wrong file.
  const wrongFile = evaluatePassCondition(condition, {
    toolCalls: [{ name: "edit_file", arguments: { path: "src/other.ts" } }],
  });
  assert.equal(wrongFile.passed, false);
  assert.match(wrongFile.reason, /wrong arguments/);

  const neverCalled = evaluatePassCondition(condition, { toolCalls: [{ name: "read_file" }] });
  assert.equal(neverCalled.passed, false);
  assert.match(neverCalled.reason, /read_file/, "the diagnostic names what was called instead");
});

test("tool-called accepts a retry that eventually got it right", () => {
  const condition = { kind: "tool-called", name: "edit_file", argumentsInclude: { path: "a.ts" } };
  assert.equal(
    evaluatePassCondition(condition, {
      toolCalls: [
        { name: "edit_file", arguments: { path: "wrong.ts" } },
        { name: "edit_file", arguments: { path: "a.ts" } },
      ],
    }).passed,
    true
  );
});

test("answer-contains supports all / any / none and is case-insensitive by default", () => {
  const answer = "The bug is in parseHeader at line 42.";
  assert.equal(
    evaluatePassCondition({ kind: "answer-contains", all: ["parseheader"] }, { answer }).passed,
    true
  );
  assert.equal(
    evaluatePassCondition(
      { kind: "answer-contains", all: ["parseheader"], caseSensitive: true },
      { answer }
    ).passed,
    false
  );
  assert.equal(
    evaluatePassCondition({ kind: "answer-contains", any: ["42", "43"] }, { answer }).passed,
    true
  );
  assert.equal(
    evaluatePassCondition({ kind: "answer-contains", none: ["line 42"] }, { answer }).passed,
    false
  );
  assert.equal(
    evaluatePassCondition({ kind: "answer-contains", all: ["x"] }, { answer: null }).passed,
    false
  );
});

test("an unknown condition kind fails rather than passing", () => {
  const result = evaluatePassCondition({ kind: "vibes" }, { answer: "anything" });
  assert.equal(result.passed, false);
  assert.match(result.reason, /unknown pass condition/);
});

test("a fixture with no pass condition fails", () => {
  const result = evaluateAll([], { answer: "anything at all" });
  assert.equal(result.passed, false);
  assert.match(result.reason, /no pass condition/);
});

test("every condition must hold, and the first failure is the reason", () => {
  const result = evaluateAll(
    [
      { kind: "answer-contains", all: ["present"] },
      { kind: "tool-called", name: "never_called" },
    ],
    { answer: "present", toolCalls: [] }
  );
  assert.equal(result.passed, false);
  assert.match(result.reason, /never_called/);
});

test("the weakest signal carries a documented cap", () => {
  // Without it a corpus drifts back into text comparison one convenient fixture at a time.
  assert.equal(MAX_ANSWER_CONTAINS_SHARE, 0.3);
});
