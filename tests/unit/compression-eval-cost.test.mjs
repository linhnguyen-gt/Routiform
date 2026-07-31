import test from "node:test";
import assert from "node:assert/strict";

/**
 * Cost accounting for a compression eval run.
 *
 * The property under test is not arithmetic, it is honesty: a savings figure that excludes what it
 * cost to produce is the claim this whole phase exists to stop Routiform from making.
 */

const { computeRunCost, priceUsage, describeRunCost } =
  await import("../../src/lib/evals/compression/cost.ts");

const RATE = { inputPerMillion: 3, outputPerMillion: 15 };
const CHEAP = { inputPerMillion: 0.1, outputPerMillion: 0.4 };

test("prices input and output at their own rates", () => {
  assert.equal(priceUsage({ inputTokens: 1_000_000, outputTokens: 0 }, RATE), 3);
  assert.equal(priceUsage({ inputTokens: 0, outputTokens: 1_000_000 }, RATE), 15);
});

test("judge spend is subtracted from the savings, not reported beside them", () => {
  const cost = computeRunCost({
    baseline: { inputTokens: 1_000_000, outputTokens: 100_000 },
    compressed: { inputTokens: 600_000, outputTokens: 100_000 },
    rate: RATE,
    judge: { usage: { inputTokens: 500_000, outputTokens: 50_000 }, rate: CHEAP },
    requestCount: 100,
  });

  assert.equal(Number(cost.grossSavings.toFixed(6)), 1.2);
  assert.ok(cost.judgeCost > 0);
  assert.equal(Number(cost.netSavings.toFixed(6)), Number((1.2 - cost.judgeCost).toFixed(6)));
  assert.ok(cost.netSavings < cost.grossSavings, "net must be strictly below gross");
});

test("a run that costs more than it saves reports a loss, not a small win", () => {
  const cost = computeRunCost({
    baseline: { inputTokens: 100_000, outputTokens: 0 },
    compressed: { inputTokens: 95_000, outputTokens: 0 },
    rate: RATE,
    judge: { usage: { inputTokens: 50_000_000, outputTokens: 0 }, rate: CHEAP },
    requestCount: 10,
  });

  assert.ok(cost.netSavings < 0);
  assert.match(describeRunCost(cost), /NET LOSS/);
});

test("summarizer spend is recurring and judge spend is not, which changes break-even", () => {
  // The judge is paid once to measure; a summarizer runs on every live request forever. Folding
  // them together would make an engine that loses money on every request look like a one-off cost.
  const withSummarizer = computeRunCost({
    baseline: { inputTokens: 1_000_000, outputTokens: 0 },
    compressed: { inputTokens: 500_000, outputTokens: 0 },
    rate: RATE,
    judge: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, rate: CHEAP },
    summarizer: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, rate: CHEAP },
    requestCount: 100,
  });
  const withoutSummarizer = computeRunCost({
    baseline: { inputTokens: 1_000_000, outputTokens: 0 },
    compressed: { inputTokens: 500_000, outputTokens: 0 },
    rate: RATE,
    judge: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, rate: CHEAP },
    requestCount: 100,
  });

  assert.ok(withSummarizer.netSavings < withoutSummarizer.netSavings);
  assert.ok(withSummarizer.breakEvenRequests > withoutSummarizer.breakEvenRequests);
});

test("break-even is null when there is no recurring saving to repay the measurement", () => {
  const cost = computeRunCost({
    baseline: { inputTokens: 100_000, outputTokens: 0 },
    compressed: { inputTokens: 100_000, outputTokens: 0 },
    rate: RATE,
    judge: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, rate: CHEAP },
    requestCount: 50,
  });

  // Not Infinity dressed up as a number — an explicit "this never pays for itself".
  assert.equal(cost.breakEvenRequests, null);
  assert.match(describeRunCost(cost), /NET LOSS|never recovers/);
});

test("reports a per-1000-request figure and the token delta", () => {
  const cost = computeRunCost({
    baseline: { inputTokens: 1_000_000, outputTokens: 200_000 },
    compressed: { inputTokens: 700_000, outputTokens: 200_000 },
    rate: RATE,
    requestCount: 500,
  });
  assert.equal(cost.tokensSaved, 300_000);
  assert.ok(cost.netSavingsPer1000 > 0);
  assert.equal(Number(cost.netSavingsPer1000.toFixed(6)), Number(((0.9 / 500) * 1000).toFixed(6)));
});

test("a run with no judge and no summarizer nets exactly its gross", () => {
  const cost = computeRunCost({
    baseline: { inputTokens: 500_000, outputTokens: 0 },
    compressed: { inputTokens: 250_000, outputTokens: 0 },
    rate: RATE,
    requestCount: 10,
  });
  assert.equal(cost.netSavings, cost.grossSavings);
  assert.equal(cost.judgeCost, 0);
});
