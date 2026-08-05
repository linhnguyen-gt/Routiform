import test from "node:test";
import assert from "node:assert/strict";

/**
 * A combo request carrying an image was routed purely by strategy, with no regard for whether the
 * chosen translator would carry the image. `cursor` discards image parts outright; `devin` and
 * `commandcode` substitute the literal string "[image omitted]", which is worse — the model is told
 * an image existed and then denied it. Recovery was error-string matching after the provider
 * rejected.
 *
 * The pre-flight is a stable partition, applied last and only when the current turn carries an
 * image. It never removes a candidate and never changes combo size, so the post-rejection fallback
 * stays exactly as load-bearing as it was.
 */

const { partitionByImageSupport } =
  await import("../../open-sse/services/combo/combo-image-partition.ts");
const { modelSupportsImages } = await import("../../open-sse/translator/model-image-support.ts");

// Verified against the real registry rather than assumed, so a registry change fails here loudly.
test("the fixture providers are what this file assumes they are", () => {
  assert.equal(modelSupportsImages("cursor", "gpt-4o"), false);
  assert.equal(modelSupportsImages("devin", "claude-sonnet-4.5"), false);
  assert.equal(modelSupportsImages("openai", "gpt-4o"), true);
  assert.equal(modelSupportsImages("gemini", "gemini-2.5-pro"), true);
  assert.equal(modelSupportsImages("claude", "claude-sonnet-4.5"), true);
});

test("capable candidates move ahead, keeping their relative order", () => {
  const candidates = [
    "cursor/gpt-4o",
    "openai/gpt-4o",
    "devin/claude-sonnet-4.5",
    "gemini/gemini-2.5-pro",
  ];
  const ordered = partitionByImageSupport(candidates);

  assert.deepEqual(ordered, [
    "openai/gpt-4o",
    "gemini/gemini-2.5-pro",
    "cursor/gpt-4o",
    "devin/claude-sonnet-4.5",
  ]);
});

test("nothing is added, removed, or duplicated", () => {
  const candidates = [
    "cursor/gpt-4o",
    "openai/gpt-4o",
    "devin/claude-sonnet-4.5",
    "gemini/gemini-2.5-pro",
  ];
  const ordered = partitionByImageSupport(candidates);

  assert.equal(ordered.length, candidates.length);
  assert.deepEqual([...ordered].sort(), [...candidates].sort());
});

test("an all-incapable combo is returned by reference, unchanged", () => {
  const candidates = ["cursor/gpt-4o", "devin/claude-sonnet-4.5"];
  const ordered = partitionByImageSupport(candidates);

  assert.equal(ordered, candidates, "no partition is possible, so nothing should be rebuilt");
});

test("an all-capable combo is returned by reference, unchanged", () => {
  const candidates = ["openai/gpt-4o", "gemini/gemini-2.5-pro", "claude/claude-sonnet-4.5"];
  const ordered = partitionByImageSupport(candidates);

  assert.equal(ordered, candidates);
});

test("a single-candidate combo is returned by reference", () => {
  const candidates = ["cursor/gpt-4o"];
  assert.equal(partitionByImageSupport(candidates), candidates);
});

test("relative order inside each group survives — the strategy's decision still holds", () => {
  // A cost-optimized ordering, say: cheapest first within each group must stay cheapest first.
  const candidates = [
    "devin/claude-sonnet-4.5",
    "gemini/gemini-2.5-pro",
    "cursor/gpt-4o",
    "openai/gpt-4o",
    "claude/claude-sonnet-4.5",
  ];
  const ordered = partitionByImageSupport(candidates);

  const capable = ordered.slice(0, 3);
  const incapable = ordered.slice(3);
  assert.deepEqual(capable, ["gemini/gemini-2.5-pro", "openai/gpt-4o", "claude/claude-sonnet-4.5"]);
  assert.deepEqual(incapable, ["devin/claude-sonnet-4.5", "cursor/gpt-4o"]);
});

test("a candidate with no provider prefix is treated as incapable, not as a crash", () => {
  const candidates = ["gpt-4o", "openai/gpt-4o"];
  const ordered = partitionByImageSupport(candidates);
  assert.deepEqual(ordered, ["openai/gpt-4o", "gpt-4o"]);
});

test("it logs once when it actually reorders, and stays quiet otherwise", () => {
  const lines = [];
  const log = { info: (_tag, msg) => lines.push(msg) };

  partitionByImageSupport(["cursor/gpt-4o", "openai/gpt-4o"], log);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /1\/2 candidates carry images/);

  partitionByImageSupport(["openai/gpt-4o", "claude/claude-sonnet-4.5"], log);
  assert.equal(lines.length, 1, "no reorder means no log line");
});

test("the post-rejection fallback patterns are still in place as the backstop", async () => {
  // The pre-flight is a best guess about the translator, not a promise about the provider. If it
  // were treated as one and the regex recovery removed, a pre-flight-approved model that rejects
  // anyway would fail the whole combo.
  const { COMBO_BAD_REQUEST_FALLBACK_PATTERNS } =
    await import("../../open-sse/services/combo/combo-constants.ts");

  assert.ok(Array.isArray(COMBO_BAD_REQUEST_FALLBACK_PATTERNS));
  assert.ok(COMBO_BAD_REQUEST_FALLBACK_PATTERNS.length > 0);
  assert.ok(
    COMBO_BAD_REQUEST_FALLBACK_PATTERNS.some((pattern) =>
      pattern.test("400 invalid_request_error: image input is not supported by this model")
    ),
    "an image-rejection error must still match a recovery pattern"
  );
});
