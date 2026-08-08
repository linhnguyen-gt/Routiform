/**
 * A combo advertises token limits on behalf of whichever member serves the request, so the
 * defaults are a product decision, not an implementation detail: they were measured across
 * 41 current-generation models (see `src/shared/constants/combo-defaults.ts`).
 *
 * These tests pin three things the numbers depend on: that a combo which chose its own
 * limits is never overwritten, that one which chose neither gets both, and that the values
 * actually reach `/v1/models` — the only surface that publishes them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-defaults-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const combosDb = await import("../../src/lib/db/combos.ts");
const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");
const { DEFAULT_COMBO_CONTEXT_LENGTH, DEFAULT_COMBO_MAX_OUTPUT_TOKENS } =
  await import("../../src/shared/constants/combo-defaults.ts");
const { createComboSchema, updateComboSchema } =
  await import("../../src/shared/validation/schemas/combo.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("the measured defaults are the researched values", () => {
  // Change these only alongside a re-measurement — the header of combo-defaults.ts records
  // the distribution they came from, and a silent drift makes that provenance a lie.
  assert.equal(DEFAULT_COMBO_CONTEXT_LENGTH, 300_000);
  assert.equal(DEFAULT_COMBO_MAX_OUTPUT_TOKENS, 64_000);
});

test("a combo created without limits gets both defaults", async () => {
  const combo = await combosDb.createCombo({ name: "defaults-combo", models: [] });

  assert.equal(combo.context_length, DEFAULT_COMBO_CONTEXT_LENGTH);
  assert.equal(combo.max_output_tokens, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);

  const readBack = await combosDb.getComboByName("defaults-combo");
  assert.equal(readBack.context_length, DEFAULT_COMBO_CONTEXT_LENGTH);
  assert.equal(readBack.max_output_tokens, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);
});

test("explicit limits survive creation and read-back", async () => {
  await combosDb.createCombo({
    name: "explicit-combo",
    models: [],
    context_length: 200_000,
    max_output_tokens: 32_000,
  });

  const readBack = await combosDb.getComboByName("explicit-combo");
  assert.equal(readBack.context_length, 200_000);
  assert.equal(readBack.max_output_tokens, 32_000);

  // getCombos() normalizes on its own path, so it is asserted separately from the by-name read.
  const listed = (await combosDb.getCombos()).find((item) => item.name === "explicit-combo");
  assert.equal(listed.context_length, 200_000);
  assert.equal(listed.max_output_tokens, 32_000);
});

test("a combo missing only one limit keeps the one it has", async () => {
  // The realistic upgrade case: rows written before max_output_tokens existed.
  await combosDb.createCombo({ name: "half-set-combo", models: [], context_length: 204_800 });

  const readBack = await combosDb.getComboByName("half-set-combo");
  assert.equal(readBack.context_length, 204_800, "an explicit value must not be replaced");
  assert.equal(readBack.max_output_tokens, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);
});

test("writing null drops a combo back to the default", async () => {
  // How the dashboard clears a limit. It cannot omit the field instead: updateCombo merges
  // its argument into the stored record, so an absent key keeps the old value.
  const created = await combosDb.createCombo({
    name: "cleared-combo",
    models: [],
    context_length: 200_000,
    max_output_tokens: 32_000,
  });

  await combosDb.updateCombo(created.id, { context_length: null, max_output_tokens: null });

  const readBack = await combosDb.getComboByName("cleared-combo");
  assert.equal(readBack.context_length, DEFAULT_COMBO_CONTEXT_LENGTH);
  assert.equal(readBack.max_output_tokens, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);
});

test("an update that omits the limits leaves them alone", async () => {
  const created = await combosDb.createCombo({
    name: "renamed-combo",
    models: [],
    context_length: 204_800,
  });

  await combosDb.updateCombo(created.id, { name: "renamed-combo-2" });

  const readBack = await combosDb.getComboByName("renamed-combo-2");
  assert.equal(readBack.context_length, 204_800, "a rename must not reset the limit");
});

test("/v1/models publishes both limits for a combo", async () => {
  const response = await v1ModelsCatalog.getUnifiedModelsResponse(
    new Request("http://localhost/api/v1/models", { method: "GET" })
  );
  assert.equal(response.status, 200);
  const body = await response.json();

  const published = body.data.find((model) => model.id === "defaults-combo");
  assert.ok(published, "an active combo must appear in the catalog");
  assert.equal(published.owned_by, "combo");
  assert.equal(published.context_length, DEFAULT_COMBO_CONTEXT_LENGTH);
  assert.equal(published.max_output_tokens, DEFAULT_COMBO_MAX_OUTPUT_TOKENS);
});

test("the API schemas accept max_output_tokens and reject out-of-range values", () => {
  const created = createComboSchema.safeParse({
    name: "schema-combo",
    config: {},
    max_output_tokens: 64_000,
  });
  assert.ok(created.success, "create must accept the new field");
  assert.equal(created.data.max_output_tokens, 64_000);

  assert.ok(updateComboSchema.safeParse({ max_output_tokens: 128_000 }).success);
  assert.ok(
    !updateComboSchema.safeParse({ max_output_tokens: 0 }).success,
    "zero is not a limit, it is an unset field"
  );
  assert.ok(!updateComboSchema.safeParse({ max_output_tokens: 500_000 }).success);
});

test("max_output_tokens alone is enough to count as an update", () => {
  // updateComboSchema rejects a body with no recognised field; the new one must be listed
  // there too, or a caller changing only the output limit gets "No valid fields to update".
  const result = updateComboSchema.safeParse({ max_output_tokens: 64_000 });
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
});
