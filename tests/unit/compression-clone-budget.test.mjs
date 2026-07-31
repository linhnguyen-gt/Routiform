import test from "node:test";
import assert from "node:assert/strict";

/**
 * Whole-body serialization budget for the compression stack.
 *
 * The registry's per-engine inflation guard has an obvious naive implementation — snapshot the
 * whole body before each engine, measure before and after — which costs a deep clone and two
 * full serializations per engine. On a multi-MB agentic payload with six engines that is roughly
 * seven deep clones and fourteen serializations per attempt, on a single-threaded event loop,
 * with every functional test still green because nothing measures it.
 *
 * So it is measured here. The numbers below are recorded from a real run, not chosen: a budget
 * picked by intuition is the same failure as no budget at all.
 *
 * `snapshotBody` is `JSON.parse(JSON.stringify(body))`, so counting `JSON.stringify` calls whose
 * argument IS the body counts clones and measurements together — and ignores the small internal
 * serializations engines do on individual message entries, which is the right granularity.
 */

const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");
const { registerEngine, resetRegistryToBuiltins } =
  await import("../../open-sse/compression/registry.ts");

// Measured against the pre-registry pipeline: snapshot + bytesBefore + the guard's own measure.
const PRE_REGISTRY_BASELINE = 3;

// Measured against the registry pipeline. `balanced` MATCHES the pre-registry baseline and `safe`
// beats it, while adding per-engine reverts that the old all-or-nothing guard did not have.
//
// It was 4 until RTK began reporting the indices it rewrote. Before that the runner could not
// know what RTK had touched, so advancing the revert point meant re-cloning the whole body; with
// a real scope it copies a few message entries instead. The lesson worth keeping: the cost was
// never in guarding per engine, it was in engines that could not say what they had changed.
const BUDGET = {
  safe: 2,
  balanced: 3,
  aggressive: 3,
};

function toolBody() {
  const lines = ["diff --git a/s b/s"];
  for (let i = 0; i < 120; i++) {
    lines.push(`-old${i} padding padding`, `+new${i} padding padding padding`);
  }
  return {
    messages: [
      { role: "user", content: "I would like to please just really actually explain the reason." },
      { role: "tool", content: lines.join("\n") },
    ],
  };
}

function noopEngine(i) {
  return {
    id: `noop-${i}`,
    stage: "lossless",
    order: 10 + i,
    gateCleared: true,
    supports: () => true,
    apply: () => ({ applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] }),
  };
}

/** Count whole-body serializations during one compression run. */
function countFullSerializations(preset, extraEngines = 0) {
  resetRegistryToBuiltins();
  for (let i = 0; i < extraEngines; i++) registerEngine(noopEngine(i));

  const body = toolBody();
  const original = JSON.stringify;
  let count = 0;
  JSON.stringify = function (value, ...rest) {
    if (value === body) count++;
    return original.call(JSON, value, ...rest);
  };
  try {
    applyStackedCompression(body, {
      enabled: true,
      userAgent: "curl/8.0",
      caveman: true,
      cavemanOutputLevel: "off",
      preset,
    });
  } finally {
    JSON.stringify = original;
    resetRegistryToBuiltins();
  }
  return count;
}

test.after(() => resetRegistryToBuiltins());

for (const [preset, budget] of Object.entries(BUDGET)) {
  test(`preset ${preset} stays within its measured serialization budget of ${budget}`, () => {
    const actual = countFullSerializations(preset);
    assert.equal(
      actual,
      budget,
      `expected exactly ${budget} whole-body serializations, saw ${actual}. ` +
        "If this rose, a snapshot or a measurement was added to the hot path; if it fell, " +
        "update the budget and say what was removed."
    );
  });
}

test("per-engine guarding costs nothing against the pre-registry pipeline", () => {
  assert.ok(
    BUDGET.balanced <= PRE_REGISTRY_BASELINE,
    `per-engine guarding must not cost extra passes over the body ` +
      `(baseline ${PRE_REGISTRY_BASELINE}, now ${BUDGET.balanced})`
  );
});

test("registering engines that decline to act costs nothing", () => {
  // This is the property that decides whether the registry can grow. If each additional engine
  // added a clone, six engines would be unshippable however cheap each one looked in isolation.
  const bare = countFullSerializations("balanced", 0);
  const withFive = countFullSerializations("balanced", 5);
  const withTwenty = countFullSerializations("balanced", 20);
  assert.equal(withFive, bare);
  assert.equal(withTwenty, bare);
});

test("an engine that declines via supports() also costs nothing", () => {
  const bare = countFullSerializations("balanced", 0);
  resetRegistryToBuiltins();
  for (let i = 0; i < 5; i++) {
    registerEngine({ ...noopEngine(i), id: `declines-${i}`, supports: () => false });
  }
  const body = toolBody();
  const original = JSON.stringify;
  let count = 0;
  JSON.stringify = function (value, ...rest) {
    if (value === body) count++;
    return original.call(JSON, value, ...rest);
  };
  try {
    applyStackedCompression(body, {
      enabled: true,
      userAgent: "curl/8.0",
      caveman: true,
      cavemanOutputLevel: "off",
      preset: "balanced",
    });
  } finally {
    JSON.stringify = original;
    resetRegistryToBuiltins();
  }
  assert.equal(count, bare);
});

test("the disabled path still serializes only to report its own byte counts", () => {
  const body = toolBody();
  const original = JSON.stringify;
  let count = 0;
  JSON.stringify = function (value, ...rest) {
    if (value === body) count++;
    return original.call(JSON, value, ...rest);
  };
  try {
    applyStackedCompression(body, { enabled: false, cavemanOutputLevel: "off" });
  } finally {
    JSON.stringify = original;
  }
  assert.equal(count, 2, "bytesBefore and bytesAfter on an untouched body");
});
