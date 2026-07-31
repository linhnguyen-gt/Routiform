/**
 * Cost accounting for a compression eval run.
 *
 * A savings figure that excludes the cost of producing it is the exact dishonesty this phase
 * exists to prevent. Judge spend and summarizer spend are SUBTRACTED, never reported alongside as
 * a footnote, and the break-even request count is reported so "we save 30%" cannot stand in for
 * "we save 30% after paying for the measurement, which takes N requests to recover".
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelRate {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
}

export function priceUsage(usage: TokenUsage, rate: ModelRate): number {
  return (
    (usage.inputTokens / 1_000_000) * rate.inputPerMillion +
    (usage.outputTokens / 1_000_000) * rate.outputPerMillion
  );
}

export interface RunCostInput {
  /** What the traffic would have cost with no compression. */
  baseline: TokenUsage;
  /** What it cost with compression applied. */
  compressed: TokenUsage;
  rate: ModelRate;
  /** Judge calls made to diagnose this run, priced at the judge combo's own rate. */
  judge?: { usage: TokenUsage; rate: ModelRate };
  /** Any model calls the compression itself made (Phase 04's summarizer). */
  summarizer?: { usage: TokenUsage; rate: ModelRate };
  /** How many real requests this run represents, for the per-1000 figure. */
  requestCount: number;
}

export interface RunCost {
  baselineCost: number;
  compressedCost: number;
  /** Saved on the traffic itself, before paying for anything. */
  grossSavings: number;
  judgeCost: number;
  summarizerCost: number;
  /** What is actually saved. Negative means compression cost more than it saved. */
  netSavings: number;
  netSavingsPer1000: number;
  /**
   * Requests needed before the recurring per-request saving repays the one-off measurement cost.
   * `null` when there is no per-request saving to repay it with — an honest "never", not a
   * misleading Infinity rendered as a number.
   */
  breakEvenRequests: number | null;
  tokensSaved: number;
}

export function computeRunCost(input: RunCostInput): RunCost {
  const baselineCost = priceUsage(input.baseline, input.rate);
  const compressedCost = priceUsage(input.compressed, input.rate);
  const grossSavings = baselineCost - compressedCost;

  const judgeCost = input.judge ? priceUsage(input.judge.usage, input.judge.rate) : 0;
  const summarizerCost = input.summarizer
    ? priceUsage(input.summarizer.usage, input.summarizer.rate)
    : 0;

  // The summarizer is a RECURRING per-request cost — it runs on live traffic — whereas the judge
  // is a one-off measurement cost. Both are subtracted, but only the summarizer belongs in the
  // per-request rate that break-even is computed from.
  const netSavings = grossSavings - judgeCost - summarizerCost;

  const requests = Math.max(1, input.requestCount);
  const recurringSavingPerRequest = (grossSavings - summarizerCost) / requests;

  return {
    baselineCost,
    compressedCost,
    grossSavings,
    judgeCost,
    summarizerCost,
    netSavings,
    netSavingsPer1000: (netSavings / requests) * 1000,
    breakEvenRequests:
      recurringSavingPerRequest > 0 ? Math.ceil(judgeCost / recurringSavingPerRequest) : null,
    tokensSaved:
      input.baseline.inputTokens +
      input.baseline.outputTokens -
      (input.compressed.inputTokens + input.compressed.outputTokens),
  };
}

/** One line for a report. States the loss plainly when there is one. */
export function describeRunCost(cost: RunCost): string {
  if (cost.netSavings <= 0) {
    return `NET LOSS of $${Math.abs(cost.netSavings).toFixed(4)} — compression cost more than it saved`;
  }
  const breakEven =
    cost.breakEvenRequests === null
      ? "never recovers the measurement cost"
      : `break-even after ${cost.breakEvenRequests} requests`;
  return `net $${cost.netSavings.toFixed(4)} saved (${cost.tokensSaved} tokens), ${breakEven}`;
}
