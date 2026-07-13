import test from "node:test";
import assert from "node:assert/strict";

const { mapCodexModelsFromApi } = await import("../../src/app/api/providers/[id]/models/route.ts");
const { getPricingForModel } = await import("../../src/shared/constants/pricing.ts");

// Model ids that are intentionally routable but NOT priced yet, with the
// reason documented. Any other unpriced id in the fallback catalog fails the
// coverage test below loudly — do not add an id here without a documented,
// verified reason (see src/shared/constants/pricing.ts).
const KNOWN_UNPRICED_IDS = new Set([
  // ChatGPT Pro research-preview only; not available via the API at launch,
  // so OpenAI has not published a per-token rate for it.
  "gpt-5.3-codex-spark",
]);

function getFallbackCodexModelIds() {
  // An empty API payload means mapCodexModelsFromApi() returns exactly the
  // curated fallback catalog (no live models to merge on top).
  const merged = mapCodexModelsFromApi({ models: [] }, true);
  return merged.map((m) => String(m.id));
}

test("codex fallback catalog leads with the current CLI model lineup", () => {
  const ids = getFallbackCodexModelIds();

  // Current lineup per the Codex CLI model picker (2026-07-12):
  // gpt-5.6-terra (default), gpt-5.6-luna, gpt-5.5, gpt-5.4-mini.
  assert.ok(ids.includes("gpt-5.6-terra"), "gpt-5.6-terra (current default) must be routable");
  assert.ok(ids.includes("gpt-5.6-luna"), "gpt-5.6-luna must be routable");
  assert.ok(ids.includes("gpt-5.5"), "gpt-5.5 must be routable");
  assert.ok(ids.includes("gpt-5.4-mini"), "gpt-5.4-mini must be routable");
});

test("codex fallback catalog keeps legacy ids routable via `codex -m <model_name>`", () => {
  const ids = getFallbackCodexModelIds();

  for (const legacyId of ["gpt-5.4", "gpt-5.3-codex", "gpt-5.2", "gpt-5"]) {
    assert.ok(ids.includes(legacyId), `legacy id ${legacyId} must still resolve`);
  }
});

test("every routable codex fallback id has a pricing entry unless explicitly documented as unpriced", () => {
  const ids = getFallbackCodexModelIds();
  const missing = [];

  for (const id of ids) {
    if (KNOWN_UNPRICED_IDS.has(id)) continue;
    const pricing = getPricingForModel("cx", id);
    if (!pricing) missing.push(id);
  }

  assert.deepEqual(
    missing,
    [],
    `codex model(s) missing a pricing entry (add a verified rate to src/shared/constants/pricing.ts or add to KNOWN_UNPRICED_IDS with a documented reason): ${missing.join(", ")}`
  );
});

test("codex fallback catalog does not include the previously-invented bare gpt-5.6 id", () => {
  const ids = getFallbackCodexModelIds();
  assert.equal(ids.includes("gpt-5.6"), false, "bare gpt-5.6 (no tier suffix) is not a real model");
});

test("live API models still override the fallback catalog (mergeCodexModels semantics)", () => {
  const merged = mapCodexModelsFromApi(
    {
      models: [{ slug: "gpt-5.6-terra", display_name: "gpt-5.6-terra (live)", visibility: "list" }],
    },
    false
  );

  const terra = merged.find((m) => m.id === "gpt-5.6-terra");
  assert.ok(terra, "gpt-5.6-terra should be present");
  assert.equal(
    terra.name,
    "gpt-5.6-terra (live)",
    "live API data must win over the static fallback"
  );
});
