import test from "node:test";
import assert from "node:assert/strict";

/**
 * Preset selection over the pure-data catalog.
 *
 * The API route and the MCP tool both need to answer "what would this preset select" without
 * importing the engines — importing them drags RTK's filter tree into contexts that only wanted to
 * describe the stack. This is the shared path both use, so the catalog and the registry cannot
 * answer the question differently.
 */

const { presetEngines, resolvePreset } = await import("../../open-sse/compression/preset.ts");
const { ENGINE_CATALOG, CATALOG_ENGINE_IDS } =
  await import("../../open-sse/compression/engine-catalog.ts");
const { listEngines } = await import("../../open-sse/compression/registry.ts");

test("the catalog lists exactly the registered engines, in the same order", () => {
  // The registry asserts this at startup; asserting it here too means a mismatch fails a test run
  // rather than only a server boot.
  assert.deepEqual(
    CATALOG_ENGINE_IDS,
    listEngines().map((e) => e.id)
  );
});

test("catalog entries carry the same stage, order and gate flag as the real engines", () => {
  const registered = new Map(listEngines().map((e) => [e.id, e]));
  for (const entry of ENGINE_CATALOG) {
    const engine = registered.get(entry.id);
    assert.ok(engine, `catalog describes an unregistered engine: ${entry.id}`);
    assert.equal(entry.stage, engine.stage, entry.id);
    assert.equal(entry.order, engine.order, entry.id);
    assert.equal(entry.gateCleared, engine.gateCleared, entry.id);
  }
});

test("selecting over the catalog matches selecting over the registry", () => {
  for (const preset of ["off", "safe", "balanced", "aggressive"]) {
    assert.deepEqual(
      presetEngines(preset, ENGINE_CATALOG).map((e) => e.id),
      presetEngines(preset, listEngines()).map((e) => e.id),
      preset
    );
  }
});

test("custom selection matches too, toggles and all", () => {
  const toggles = { rtk: true, lite: true, gcf: false };
  assert.deepEqual(
    presetEngines("custom", ENGINE_CATALOG, toggles).map((e) => e.id),
    presetEngines("custom", listEngines(), toggles).map((e) => e.id)
  );
});

test("every catalog entry carries a human summary", () => {
  // The route surfaces gateCleared so a disabled engine renders with its reason rather than
  // vanishing. That only helps if there is something to read.
  for (const entry of ENGINE_CATALOG) {
    assert.ok(entry.summary.length > 20, `${entry.id} has no usable summary`);
    assert.ok(entry.summary.endsWith("."), `${entry.id} summary should be a sentence`);
  }
});

test("the route's view of an unconfigured install is balanced", () => {
  assert.equal(resolvePreset({ contextValidation: "auto-compress" }), "balanced");
  assert.deepEqual(
    presetEngines("balanced", ENGINE_CATALOG).map((e) => e.id),
    ["rtk", "caveman-en"]
  );
});
