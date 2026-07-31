/**
 * The fidelity gate. One predicate, one place, changed only by an explicit recorded decision.
 *
 * The bar is TASK SUCCESS, not similarity between two answers. A judge score does not catch the
 * case where compression makes an agent call the wrong tool or edit the wrong file — both answers
 * read as equivalent while the work performed diverges. Routiform's traffic is coding-agent
 * dominant, so the outcome is what matters and the prose is not.
 *
 * Both figures are relative to the OBSERVED uncompressed rate, never to a notional 100%. A task the
 * model fails without compression is not evidence against compression, and counting it as one would
 * make every engine look worse than it is.
 */

/** Overall: compressed success must be at least this fraction of the uncompressed rate. */
export const OVERALL_THRESHOLD = 0.95;

/** Per family: no single family may fall below this fraction of its own uncompressed rate. */
export const PER_FAMILY_THRESHOLD = 0.9;

/**
 * Minimum runs behind a rate before it is allowed to decide anything.
 *
 * Task success is binary, so a family of 10 tasks resolves to 10% granularity and carries real
 * run-to-run noise. Three repeats per task is the floor; below that a single flaky run moves the
 * rate by more than the gate's own margin.
 */
export const MIN_RUNS_PER_FAMILY = 30;

export interface FamilyOutcome {
  family: string;
  /** Runs that passed / total runs, for the uncompressed arm. */
  baselinePassed: number;
  baselineRuns: number;
  /** Runs that passed / total runs, for the compressed arm. */
  compressedPassed: number;
  compressedRuns: number;
}

export interface FamilyVerdict extends FamilyOutcome {
  baselineRate: number;
  compressedRate: number;
  /** compressed rate as a fraction of the baseline rate. */
  ratio: number;
  passed: boolean;
  reason?: string;
}

export interface GateVerdict {
  passed: boolean;
  overallRatio: number;
  families: FamilyVerdict[];
  /** Why the gate failed, in the order a reader needs it. Empty when it passed. */
  failures: string[];
}

function rate(passed: number, runs: number): number {
  return runs > 0 ? passed / runs : 0;
}

function ratioOf(compressed: number, baseline: number): number {
  // A baseline of zero means the model could not do these tasks uncompressed either. That is not
  // a pass — it is an unusable measurement, and treating 0/0 as 1.0 would let a broken family
  // certify an engine.
  if (baseline === 0) return 0;
  return compressed / baseline;
}

/**
 * Evaluate the gate.
 *
 * Returns a verdict rather than throwing or logging: the caller decides whether a failure blocks a
 * release or merely reports, and a predicate that decides that for them cannot be reused by the
 * dashboard.
 */
export function evaluateGate(outcomes: readonly FamilyOutcome[]): GateVerdict {
  const failures: string[] = [];

  if (outcomes.length === 0) {
    return {
      passed: false,
      overallRatio: 0,
      families: [],
      failures: ["no families were measured, so nothing was demonstrated"],
    };
  }

  const families: FamilyVerdict[] = outcomes.map((outcome) => {
    const baselineRate = rate(outcome.baselinePassed, outcome.baselineRuns);
    const compressedRate = rate(outcome.compressedPassed, outcome.compressedRuns);
    const ratio = ratioOf(compressedRate, baselineRate);

    let reason: string | undefined;
    if (
      outcome.baselineRuns < MIN_RUNS_PER_FAMILY ||
      outcome.compressedRuns < MIN_RUNS_PER_FAMILY
    ) {
      reason = `too few runs (${outcome.baselineRuns} baseline / ${outcome.compressedRuns} compressed, need ${MIN_RUNS_PER_FAMILY})`;
    } else if (baselineRate === 0) {
      reason = "the uncompressed baseline failed every run, so this family measures nothing";
    } else if (ratio < PER_FAMILY_THRESHOLD) {
      reason = `${(ratio * 100).toFixed(1)}% of baseline, below the ${PER_FAMILY_THRESHOLD * 100}% per-family floor`;
    }

    return {
      ...outcome,
      baselineRate,
      compressedRate,
      ratio,
      passed: reason === undefined,
      reason,
    };
  });

  for (const family of families) {
    if (!family.passed) failures.push(`${family.family}: ${family.reason}`);
  }

  // Aggregate over RUNS rather than averaging family ratios: averaging lets a tiny family swing
  // the result as hard as a large one, which is not what "overall success rate" means.
  const baselinePassed = outcomes.reduce((sum, o) => sum + o.baselinePassed, 0);
  const baselineRuns = outcomes.reduce((sum, o) => sum + o.baselineRuns, 0);
  const compressedPassed = outcomes.reduce((sum, o) => sum + o.compressedPassed, 0);
  const compressedRuns = outcomes.reduce((sum, o) => sum + o.compressedRuns, 0);

  const overallRatio = ratioOf(
    rate(compressedPassed, compressedRuns),
    rate(baselinePassed, baselineRuns)
  );

  if (overallRatio < OVERALL_THRESHOLD) {
    failures.push(
      `overall ${(overallRatio * 100).toFixed(1)}% of baseline, below the ${OVERALL_THRESHOLD * 100}% gate`
    );
  }

  return { passed: failures.length === 0, overallRatio, families, failures };
}

/** One-line summary for a CI log or a dashboard badge. */
export function describeVerdict(verdict: GateVerdict): string {
  if (verdict.passed) {
    return `PASS — ${(verdict.overallRatio * 100).toFixed(1)}% of the uncompressed baseline across ${verdict.families.length} families`;
  }
  return `FAIL — ${verdict.failures.join("; ")}`;
}
