/**
 * Task Fitness Lookup
 *
 * Maps a model id × task type to a fitness score in [0..1]. The tables live in
 * `taskFitnessTable.ts`; this module owns only how a model id is matched against them.
 *
 * LONGEST MATCH WINS. The scan used to return the first pattern whose substring appeared
 * in the model id, which made the result depend on object key order and let a broad
 * pattern shadow the specific one written to override it: `gpt-4o-mini` matched `gpt-4o`
 * and scored as the full model, tying with Claude Sonnet at the top of every
 * fitness-ranked list. Preferring the longest match makes the tables order-independent,
 * so a specific id can always override its family.
 *
 * Model ids arrive namespaced by aggregators (`openai/gpt-4o-mini`, `anthropic/claude-…`,
 * `moonshotai/kimi-k2.5`), so matching stays substring-based rather than prefix-based.
 */

import { FITNESS_TABLE, WILDCARD_BOOSTS } from "./taskFitnessTable";

/**
 * Score of the longest pattern in `table` contained in `model`, or null if none match.
 *
 * Exported for the ordering test only. The shipped tables happen to list specific ids
 * before their families, which would let a first-match scan pass by luck; the test drives
 * this directly with a deliberately hostile table so the invariant is pinned to the
 * algorithm rather than to how the data is currently sorted.
 */
export function findLongestMatch(model: string, table: Record<string, number>): number | null {
  let longest = -1;
  let score: number | null = null;

  for (const [pattern, patternScore] of Object.entries(table)) {
    if (pattern.length <= longest) continue;
    if (!model.includes(pattern)) continue;
    longest = pattern.length;
    score = patternScore;
  }

  return score;
}

/**
 * Get task fitness score for a model × taskType combination.
 * Returns 0.5 (neutral) if no mapping found.
 */
export function getTaskFitness(model: string, taskType: string): number {
  const normalizedModel = model.toLowerCase();
  const normalizedTask = taskType.toLowerCase();
  const table = FITNESS_TABLE[normalizedTask] || FITNESS_TABLE.default;

  const matched = findLongestMatch(normalizedModel, table);
  if (matched !== null) return matched;

  // Wildcard boost — only reached when the model is absent from the table entirely.
  let baseScore = 0.5;
  for (const wc of WILDCARD_BOOSTS) {
    if (normalizedModel.includes(wc.pattern) && normalizedTask === wc.taskType) {
      baseScore += wc.boost;
    }
  }

  return Math.min(1.0, baseScore);
}

/**
 * Get all task types available.
 */
export function getTaskTypes(): string[] {
  return Object.keys(FITNESS_TABLE).filter((k) => k !== "default");
}
