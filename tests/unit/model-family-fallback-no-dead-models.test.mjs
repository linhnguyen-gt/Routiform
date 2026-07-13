/**
 * Data-driven regression test: no MODEL_FAMILIES fallback chain may ever
 * list a shut-down model as a candidate TARGET, and the gemini-cli registry's
 * default (first) model must be live.
 *
 * Context: gemini-3-pro-preview was shut down 2026-03-09
 * (https://ai.google.dev/gemini-api/docs/deprecations). It previously
 * appeared as the first model in the gemini-cli registry (making it the
 * default in the UI picker) and as a fallback target in several
 * MODEL_FAMILIES chains (breaking Gemini failover). This test is written
 * against a DEPRECATED_MODEL_IDS set so it keeps catching this class of bug
 * as more models get shut down.
 */
import test from "node:test";
import assert from "node:assert/strict";

const modelFamilyFallback = await import("../../open-sse/services/modelFamilyFallback.ts");
const { DEPRECATED_MODEL_IDS } = modelFamilyFallback;

const { OAUTH_PROVIDERS } = await import("../../open-sse/config/registry-providers-oauth.ts");

// MODEL_FAMILIES itself is not exported; access it indirectly through the
// public getModelFamily helper, which returns [model, ...family].
const { getModelFamily, isInModelFamily } = modelFamilyFallback;

// All keys ever tested against getModelFamily, gathered by probing every
// deprecated id plus every live sibling id that appears in the module's
// public exports via getNextFamilyFallback traversal is not feasible without
// the raw map, so we probe the known family keys through isInModelFamily.
const KNOWN_FAMILY_KEYS = [
  "gemini-3-pro",
  "gemini-3.1-pro",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-high",
  "gemini-3.1-pro-high",
  "gemini-2.5-pro",
  "gemini-2.5-pro-preview-06-05",
  "claude-opus-4-1-20250805",
  "claude-opus-4-20250514",
  "claude-opus-4-6",
  "claude-opus-4-6-thinking",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250929",
  "gpt-5",
  "gpt-5.1",
];

test("DEPRECATED_MODEL_IDS: gemini-3-pro-preview is tracked as a known-dead model", () => {
  assert.ok(DEPRECATED_MODEL_IDS instanceof Set);
  assert.ok(DEPRECATED_MODEL_IDS.has("gemini-3-pro-preview"));
});

test("MODEL_FAMILIES: no fallback chain lists a DEPRECATED_MODEL_IDS entry as a target", () => {
  const failures = [];

  for (const key of KNOWN_FAMILY_KEYS) {
    if (!isInModelFamily(key)) continue;
    const family = getModelFamily(key); // [key, ...targets]
    const targets = family.slice(1);
    for (const target of targets) {
      if (DEPRECATED_MODEL_IDS.has(target)) {
        failures.push(`${key} -> ${target}`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `fallback chains must never target a dead model: ${failures.join(", ")}`
  );
});

test("MODEL_FAMILIES: a DEPRECATED_MODEL_IDS entry may still be a family KEY (legacy entry point) but not a target of itself", () => {
  for (const deprecatedId of DEPRECATED_MODEL_IDS) {
    if (!isInModelFamily(deprecatedId)) continue;
    const family = getModelFamily(deprecatedId);
    const targets = family.slice(1);
    assert.ok(
      !targets.includes(deprecatedId),
      `${deprecatedId}'s own fallback chain must not target itself`
    );
  }
});

test("registry: gemini-cli's default (first) model is not a known-dead model", () => {
  const models = OAUTH_PROVIDERS["gemini-cli"].models;
  assert.ok(Array.isArray(models) && models.length > 0, "gemini-cli must have at least one model");
  const first = models[0].id;
  assert.ok(
    !DEPRECATED_MODEL_IDS.has(first),
    `gemini-cli's default model "${first}" must not be a shut-down model`
  );
});

test("registry: gemini-cli models list contains no known-dead model at all", () => {
  const models = OAUTH_PROVIDERS["gemini-cli"].models;
  const deadEntries = models.filter((m) => DEPRECATED_MODEL_IDS.has(m.id));
  assert.deepEqual(
    deadEntries.map((m) => m.id),
    [],
    "gemini-cli registry must not offer a shut-down model in the picker"
  );
});

// ── Whole-catalog guard ──────────────────────────────────────────────────────
// The gemini-cli-only checks above were how the first dead model got caught,
// but they only ever looked at one provider. Dead models were simultaneously
// being offered by the Vertex, OpenRouter-proxy, Puter and AI/ML API entries.
// This sweeps EVERY registry so the next shutdown cannot hide in whichever
// provider list nobody happened to be looking at.

const { APIKEY_PROVIDERS } = await import("../../open-sse/config/registry-providers-apikey.ts");
const { FREE_PROVIDERS } = await import("../../open-sse/config/registry-providers-free.ts");

// Aggregators namespace Google models as "google/<id>" and some tag a tier
// with ":free"; the deprecation set holds the bare vendor id. Normalize both
// so a prefixed or tagged listing of a shut-down model cannot slip through.
//
// Residual gap, stated rather than papered over: this matches exact ids only,
// so a dated variant ("gemini-2.0-flash-001") would still slip past. Matching
// by prefix instead would be worse — "gemini-2.0-flash" is a prefix of live
// ids too. Dated variants must be added to DEPRECATED_MODEL_IDS explicitly.
const bareModelId = (id) => {
  const withoutVendor = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const colon = withoutVendor.indexOf(":");
  return colon === -1 ? withoutVendor : withoutVendor.slice(0, colon);
};

const ALL_REGISTRIES = [
  ["oauth", OAUTH_PROVIDERS],
  ["apikey", APIKEY_PROVIDERS],
  ["free", FREE_PROVIDERS],
];

test("registry: NO provider in any registry offers a known-dead model", () => {
  const offenders = [];

  for (const [registryName, providers] of ALL_REGISTRIES) {
    for (const [providerId, entry] of Object.entries(providers)) {
      for (const model of entry.models ?? []) {
        if (DEPRECATED_MODEL_IDS.has(bareModelId(model.id))) {
          offenders.push(`${registryName}/${providerId}: ${model.id}`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these providers still offer a shut-down model: ${offenders.join(", ")}`
  );
});

// A redirect that lands on another dead model is worse than no redirect: it
// converts one 404 into a second 404 while reporting that it "forwarded" the
// request.
test("modelDeprecation: no alias redirects to a model that is itself dead", async () => {
  const { getBuiltInAliases } = await import("../../open-sse/services/modelDeprecation.ts");
  const offenders = Object.entries(getBuiltInAliases())
    .filter(([, target]) => DEPRECATED_MODEL_IDS.has(bareModelId(target)))
    .map(([from, to]) => `${from} -> ${to}`);

  assert.deepEqual(
    offenders,
    [],
    `deprecation aliases must forward to a LIVE model: ${offenders.join(", ")}`
  );
});

// resolveModelAlias is SINGLE-PASS: it applies one substitution and stops. So
// an alias whose target is itself an alias key silently resolves to a
// half-migrated id. The dead-target check above cannot see this, because the
// intermediate id is live — it is only the SECOND hop that goes somewhere
// wrong. This is the assertion that would have caught
// "gemini-3.1-flash-image-preview" -> "gemini-3.1-flash-image" -> (chat model).
test("modelDeprecation: no alias target is itself an alias key (single-pass chains resolve wrong)", async () => {
  const { getBuiltInAliases } = await import("../../open-sse/services/modelDeprecation.ts");
  const aliases = getBuiltInAliases();
  const keys = new Set(Object.keys(aliases));

  const chains = Object.entries(aliases)
    .filter(([, target]) => keys.has(target))
    .map(([from, to]) => `${from} -> ${to} -> ${aliases[to]}`);

  assert.deepEqual(
    chains,
    [],
    `alias targets must be final, not themselves aliased: ${chains.join(", ")}`
  );
});

// Every id purged from a catalog must still resolve, or users with a saved
// config pointing at it get a hard failure instead of a working model.
test("modelDeprecation: every dead model still has a redirect to a live one", async () => {
  const { resolveModelAlias } = await import("../../open-sse/services/modelDeprecation.ts");
  const unresolved = [];

  for (const deadId of DEPRECATED_MODEL_IDS) {
    const resolved = resolveModelAlias(deadId);
    if (resolved === deadId) unresolved.push(deadId);
  }

  assert.deepEqual(
    unresolved,
    [],
    `a purged model with no redirect is a hard 404 for existing configs: ${unresolved.join(", ")}`
  );
});
