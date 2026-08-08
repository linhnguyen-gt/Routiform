/**
 * The rules behind the two token-limit inputs on the combo form.
 *
 * Two of them are load-bearing in a way that is easy to regress: an empty box must mean
 * "use the default" all the way to the stored record (the update endpoint merges, so an
 * omitted key silently keeps the old value), and a combo sitting on the default must render
 * empty rather than prefilled, or editing its name would freeze its limit at today's number.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  COMBO_CONTEXT_LENGTH_FIELD,
  COMBO_MAX_OUTPUT_TOKENS_FIELD,
  toTokenLimitInput,
  parseTokenLimitInput,
} =
  await import("../../src/app/(dashboard)/dashboard/combos/components/combo-token-limit-fields.ts");
const {
  DEFAULT_COMBO_CONTEXT_LENGTH,
  DEFAULT_COMBO_MAX_OUTPUT_TOKENS,
  COMBO_CONTEXT_LENGTH_BOUNDS,
  COMBO_MAX_OUTPUT_TOKENS_BOUNDS,
} = await import("../../src/shared/constants/combo-defaults.ts");
const { createComboSchema, updateComboSchema } =
  await import("../../src/shared/validation/schemas/combo.ts");

test("the fields carry the shared defaults and bounds, not their own copies", () => {
  // A second copy of these numbers is how the form starts accepting values the API rejects.
  assert.equal(COMBO_CONTEXT_LENGTH_FIELD.fallback, DEFAULT_COMBO_CONTEXT_LENGTH);
  assert.equal(COMBO_CONTEXT_LENGTH_FIELD.min, COMBO_CONTEXT_LENGTH_BOUNDS.min);
  assert.equal(COMBO_CONTEXT_LENGTH_FIELD.max, COMBO_CONTEXT_LENGTH_BOUNDS.max);

  assert.equal(COMBO_MAX_OUTPUT_TOKENS_FIELD.fallback, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);
  assert.equal(COMBO_MAX_OUTPUT_TOKENS_FIELD.min, COMBO_MAX_OUTPUT_TOKENS_BOUNDS.min);
  assert.equal(COMBO_MAX_OUTPUT_TOKENS_FIELD.max, COMBO_MAX_OUTPUT_TOKENS_BOUNDS.max);
});

test("a combo sitting on the default renders an empty box", () => {
  // The API normalizes a missing limit to the default before the form sees it, so prefilling
  // whatever arrives would persist the default on the next save and stop the combo tracking it.
  assert.equal(toTokenLimitInput(DEFAULT_COMBO_CONTEXT_LENGTH, COMBO_CONTEXT_LENGTH_FIELD), "");
  assert.equal(toTokenLimitInput(undefined, COMBO_CONTEXT_LENGTH_FIELD), "");
  assert.equal(toTokenLimitInput(null, COMBO_CONTEXT_LENGTH_FIELD), "");
  assert.equal(toTokenLimitInput(0, COMBO_CONTEXT_LENGTH_FIELD), "");
});

test("a combo with its own limit renders that limit", () => {
  assert.equal(toTokenLimitInput(200_000, COMBO_CONTEXT_LENGTH_FIELD), "200000");
  assert.equal(toTokenLimitInput(32_000, COMBO_MAX_OUTPUT_TOKENS_FIELD), "32000");
});

test("an empty box parses to null, which is what clears a stored limit", () => {
  for (const raw of ["", "   "]) {
    const parsed = parseTokenLimitInput(raw, COMBO_CONTEXT_LENGTH_FIELD);
    assert.ok(parsed.ok);
    assert.equal(parsed.value, null, "undefined would be merged away and keep the old value");
  }
});

test("a plain number inside the bounds parses to that number", () => {
  const parsed = parseTokenLimitInput("200000", COMBO_CONTEXT_LENGTH_FIELD);
  assert.ok(parsed.ok);
  assert.equal(parsed.value, 200_000);
});

test("anything Number() would quietly accept is rejected", () => {
  // Each of these coerces to a valid number, and each would reach the API as something its
  // schema rejects — or, worse, as a different number than the one typed.
  for (const raw of ["1e6", "0x10", "200_000", "200000.5", "-1", "  12 34", "abc"]) {
    const parsed = parseTokenLimitInput(raw, COMBO_CONTEXT_LENGTH_FIELD);
    assert.equal(parsed.ok, false, `"${raw}" must not pass`);
  }
});

test("out-of-range values are rejected with the actual bounds in the message", () => {
  const low = parseTokenLimitInput(
    String(COMBO_CONTEXT_LENGTH_BOUNDS.min - 1),
    COMBO_CONTEXT_LENGTH_FIELD
  );
  assert.equal(low.ok, false);
  assert.match(low.error, /1,000/);

  const high = parseTokenLimitInput(
    String(COMBO_CONTEXT_LENGTH_BOUNDS.max + 1),
    COMBO_CONTEXT_LENGTH_FIELD
  );
  assert.equal(high.ok, false);
  assert.match(high.error, /2,000,000/);
});

test("the two fields do not share a range", () => {
  // 300,000 is a fine context length and far past any model's output limit.
  assert.ok(parseTokenLimitInput("300000", COMBO_CONTEXT_LENGTH_FIELD).ok);
  assert.equal(parseTokenLimitInput("300000", COMBO_MAX_OUTPUT_TOKENS_FIELD).ok, false);
});

test("every value the form can produce is accepted by the API schema", () => {
  // The whole point of sharing bounds: the form must never build a body the endpoint rejects.
  for (const raw of ["", "200000", String(COMBO_CONTEXT_LENGTH_BOUNDS.min)]) {
    const parsed = parseTokenLimitInput(raw, COMBO_CONTEXT_LENGTH_FIELD);
    assert.ok(parsed.ok);
    assert.ok(
      updateComboSchema.safeParse({ context_length: parsed.value }).success,
      `update rejected ${JSON.stringify(parsed.value)}`
    );
    assert.ok(
      createComboSchema.safeParse({ name: "x", config: {}, context_length: parsed.value }).success,
      `create rejected ${JSON.stringify(parsed.value)}`
    );
  }
});
