import test from "node:test";
import assert from "node:assert/strict";

// Two schemas validate the same `fallbackStrategy` settings field on different write paths.
// They disagreed: one rejected "strict-random" while the other accepted it and the account
// selector implemented it, so whichever schema validated a given write silently won.
// These tests pin them to one value set.

// Both modules export a schema of the same name; alias them to keep the assertions readable.
const { updateSettingsSchema: settingsUpdateSchema } =
  await import("../../src/shared/validation/settingsSchemas.ts");
const { updateSettingsSchema: settingsGeneralSchema } =
  await import("../../src/shared/validation/schemas/settings-general.ts");

/** Every value the account selector implements. */
const IMPLEMENTED_STRATEGIES = [
  "fill-first",
  "round-robin",
  "p2c",
  "random",
  "least-used",
  "cost-optimized",
  "strict-random",
];

function accepts(schema, value) {
  return schema.safeParse({ fallbackStrategy: value }).success;
}

test("both fallbackStrategy schemas accept the identical value set", () => {
  for (const value of IMPLEMENTED_STRATEGIES) {
    assert.equal(
      accepts(settingsUpdateSchema, value),
      accepts(settingsGeneralSchema, value),
      `schemas disagree on "${value}"`
    );
  }
});

test("strict-random is accepted by both schemas, not one", () => {
  assert.ok(
    accepts(settingsUpdateSchema, "strict-random"),
    "settingsUpdateSchema rejects strict-random, which the account selector implements"
  );
  assert.ok(accepts(settingsGeneralSchema, "strict-random"));
});

test("every strategy the account selector implements is accepted by both schemas", () => {
  for (const value of IMPLEMENTED_STRATEGIES) {
    assert.ok(accepts(settingsUpdateSchema, value), `settingsUpdateSchema rejects "${value}"`);
    assert.ok(accepts(settingsGeneralSchema, value), `settingsGeneralSchema rejects "${value}"`);
  }
});

test("both schemas reject an unimplemented strategy", () => {
  assert.equal(accepts(settingsUpdateSchema, "not-a-strategy"), false);
  assert.equal(accepts(settingsGeneralSchema, "not-a-strategy"), false);
});
