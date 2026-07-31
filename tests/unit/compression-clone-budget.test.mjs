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

// Measured against the registry pipeline. `balanced` is one MORE than the baseline, and that one
// buys per-engine reverts: an engine that inflates no longer discards every other engine's work.
// `safe` is one FEWER, because a single-engine run needs no revert point advanced at all.
const BUDGET = {
  safe: 2,
  balanced: 4,
  aggressive: 4,
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

test("the default engine set costs at most one serialization more than the pre-registry pipeline", () => {
  assert.ok(
    BUDGET.balanced <= PRE_REGISTRY_BASELINE + 1,
    `per-engine guarding must not cost more than one extra pass over the body ` +
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
