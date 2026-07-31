/**
 * The four completion signals a fixture can carry.
 *
 * These exist because the gate measures whether the TASK was done, not whether two answers read
 * alike. Each evaluator is deterministic and programmatic — a pass condition that needs a model to
 * adjudicate it is a judge by another name, and the judge is explicitly not the gate.
 */

export type PassConditionKind = "tests-pass" | "file-edited" | "tool-called" | "answer-contains";

export interface TestsPassCondition {
  kind: "tests-pass";
  /** Exit code 0 means the task was completed. Run by the harness, never here. */
  command: string;
}

export interface FileEditedCondition {
  kind: "file-edited";
  path: string;
  /** Every pattern must appear in the post-state. */
  mustContain?: string[];
  /** None of these may appear — catches an edit that deleted more than it should. */
  mustNotContain?: string[];
}

export interface ToolCalledCondition {
  kind: "tool-called";
  name: string;
  /** Argument paths that must be present, with the value each must equal or contain. */
  argumentsInclude?: Record<string, string | number | boolean>;
}

export interface AnswerContainsCondition {
  kind: "answer-contains";
  /** Every one must appear in the response text. */
  all?: string[];
  /** At least one must appear. */
  any?: string[];
  /** None may appear. */
  none?: string[];
  caseSensitive?: boolean;
}

export type PassCondition =
  | TestsPassCondition
  | FileEditedCondition
  | ToolCalledCondition
  | AnswerContainsCondition;

export interface EvaluationInput {
  /** Assistant response text, when there is one. */
  answer?: string | null;
  /** Tool calls the model made, normalised. */
  toolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  /** Post-state of files the task was allowed to touch, keyed by path. */
  files?: Record<string, string>;
  /** Exit code of the fixture's test command, when the harness ran one. */
  testExitCode?: number | null;
}

export interface EvaluationResult {
  passed: boolean;
  /** Why it failed, for the diagnostic column. Empty when it passed. */
  reason?: string;
}

/**
 * `answer-contains` is the weakest signal and the easiest to over-use — a corpus built mostly from
 * it has quietly turned back into text comparison. The cap is enforced at corpus load, and this
 * constant is the single place it is written down.
 */
export const MAX_ANSWER_CONTAINS_SHARE = 0.3;

function evaluateTestsPass(
  condition: TestsPassCondition,
  input: EvaluationInput
): EvaluationResult {
  if (input.testExitCode == null) {
    // An unrun command is not a pass. Treating "we did not check" as success is how a gate stops
    // gating without anyone editing the threshold.
    return { passed: false, reason: `test command was never run: ${condition.command}` };
  }
  return input.testExitCode === 0
    ? { passed: true }
    : { passed: false, reason: `test command exited ${input.testExitCode}` };
}

function evaluateFileEdited(
  condition: FileEditedCondition,
  input: EvaluationInput
): EvaluationResult {
  const content = input.files?.[condition.path];
  if (content == null) {
    return { passed: false, reason: `file not present after the run: ${condition.path}` };
  }
  for (const needle of condition.mustContain ?? []) {
    if (!content.includes(needle)) {
      return { passed: false, reason: `${condition.path} is missing ${JSON.stringify(needle)}` };
    }
  }
  for (const needle of condition.mustNotContain ?? []) {
    if (content.includes(needle)) {
      return {
        passed: false,
        reason: `${condition.path} still contains ${JSON.stringify(needle)}`,
      };
    }
  }
  return { passed: true };
}

function evaluateToolCalled(
  condition: ToolCalledCondition,
  input: EvaluationInput
): EvaluationResult {
  const calls = (input.toolCalls ?? []).filter((call) => call.name === condition.name);
  if (calls.length === 0) {
    const seen = (input.toolCalls ?? []).map((c) => c.name).join(", ") || "none";
    return { passed: false, reason: `${condition.name} was never called (saw: ${seen})` };
  }

  const required = Object.entries(condition.argumentsInclude ?? {});
  if (required.length === 0) return { passed: true };

  // Any single call satisfying every requirement is enough — a model that retries a tool with
  // better arguments has still done the task.
  const satisfied = calls.some((call) =>
    required.every(([key, expected]) => {
      const actual = call.arguments?.[key];
      if (typeof expected === "string" && typeof actual === "string") {
        return actual.includes(expected);
      }
      return actual === expected;
    })
  );

  return satisfied
    ? { passed: true }
    : { passed: false, reason: `${condition.name} was called with the wrong arguments` };
}

function evaluateAnswerContains(
  condition: AnswerContainsCondition,
  input: EvaluationInput
): EvaluationResult {
  const raw = input.answer;
  if (raw == null) return { passed: false, reason: "no answer text" };

  const haystack = condition.caseSensitive ? raw : raw.toLowerCase();
  const norm = (needle: string) => (condition.caseSensitive ? needle : needle.toLowerCase());

  for (const needle of condition.all ?? []) {
    if (!haystack.includes(norm(needle))) {
      return { passed: false, reason: `answer is missing ${JSON.stringify(needle)}` };
    }
  }
  for (const needle of condition.none ?? []) {
    if (haystack.includes(norm(needle))) {
      return { passed: false, reason: `answer contains forbidden ${JSON.stringify(needle)}` };
    }
  }
  const any = condition.any ?? [];
  if (any.length > 0 && !any.some((needle) => haystack.includes(norm(needle)))) {
    return { passed: false, reason: `answer matched none of ${any.length} alternatives` };
  }
  return { passed: true };
}

export function evaluatePassCondition(
  condition: PassCondition,
  input: EvaluationInput
): EvaluationResult {
  switch (condition.kind) {
    case "tests-pass":
      return evaluateTestsPass(condition, input);
    case "file-edited":
      return evaluateFileEdited(condition, input);
    case "tool-called":
      return evaluateToolCalled(condition, input);
    case "answer-contains":
      return evaluateAnswerContains(condition, input);
    default: {
      // An unknown condition fails rather than passing: a fixture the harness cannot evaluate has
      // demonstrated nothing, and "we did not understand it" must never read as success.
      const unknown = condition as { kind?: string };
      return { passed: false, reason: `unknown pass condition kind: ${unknown.kind}` };
    }
  }
}

/** All conditions must hold. A task is done or it is not. */
export function evaluateAll(
  conditions: readonly PassCondition[],
  input: EvaluationInput
): EvaluationResult {
  if (conditions.length === 0) {
    return { passed: false, reason: "fixture declares no pass condition" };
  }
  for (const condition of conditions) {
    const result = evaluatePassCondition(condition, input);
    if (!result.passed) return result;
  }
  return { passed: true };
}
