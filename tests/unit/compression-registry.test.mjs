import test from "node:test";
import assert from "node:assert/strict";

const { registerEngine, listEngines, selectEngines, resetRegistryToBuiltins, BUILTIN_ENGINE_IDS } =
  await import("../../open-sse/compression/registry.ts");

const { resolvePreset, presetEngines, COMPRESSION_PRESETS } =
  await import("../../open-sse/compression/preset.ts");

const { runEngine } = await import("../../open-sse/compression/run-engine.ts");
const { snapshotBody } = await import("../../open-sse/compression/inflation-guard.ts");

function ctx(overrides = {}) {
  return {
    provider: "openai",
    model: "gpt-4o",
    userAgent: "curl/8.0",
    rtkProfile: "full",
    bodyShape: "openai-chat",
    conversationId: null,
    apiKeyId: null,
    ...overrides,
  };
}

/** Minimal engine that shrinks or grows message 0 by a fixed amount. */
function fakeEngine(id, stage, order, delta, opts = {}) {
  return {
    id,
    stage,
    order,
    gateCleared: opts.gateCleared ?? true,
    supports: opts.supports ?? (() => true),
    apply(body) {
      const msgs = body.messages;
      if (!Array.isArray(msgs) || msgs.length === 0) {
        return { applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] };
      }
      const before = msgs[0].content.length;
      msgs[0].content =
        delta < 0
          ? msgs[0].content.slice(0, Math.max(0, before + delta))
          : msgs[0].content + "x".repeat(delta);
      return {
        applied: true,
        stats: { delta },
        bytesBefore: before,
        bytesAfter: msgs[0].content.length,
        touchedIndices: [0],
      };
    },
  };
}

function body(text = "a".repeat(200), second = "b".repeat(200)) {
  return {
    messages: [
      { role: "user", content: text },
      { role: "user", content: second },
    ],
  };
}

test.beforeEach(() => resetRegistryToBuiltins());
test.after(() => resetRegistryToBuiltins());

test("the built-in engines are registered and ordered lossless before lossy", () => {
  const ids = listEngines().map((e) => e.id);
  assert.deepEqual(ids.slice().sort(), BUILTIN_ENGINE_IDS.slice().sort());
  const stages = listEngines().map((e) => e.stage);
  assert.equal(stages.indexOf("lossy") > stages.lastIndexOf("lossless"), true);
});

test("engines run in declared order, lossless first and caveman-en last", () => {
  assert.deepEqual(
    listEngines().map((e) => e.id),
    ["lite", "rtk", "session-dedup", "gcf", "responses-compact", "caveman-en"]
  );
});

test("a lossy engine declaring order 1 still sorts after every lossless engine", () => {
  registerEngine(fakeEngine("greedy-lossy", "lossy", 1, -1));
  const ordered = listEngines();
  const idx = ordered.findIndex((e) => e.id === "greedy-lossy");
  const lastLossless = ordered.map((e) => e.stage).lastIndexOf("lossless");
  assert.ok(idx > lastLossless, "stage is the primary sort key, order is secondary");
});

test("registering a duplicate engine id throws", () => {
  assert.throws(
    () => registerEngine(fakeEngine("rtk", "lossless", 999, -1)),
    /already registered/i
  );
});

test("registering an engine with an unknown stage throws", () => {
  assert.throws(() => registerEngine(fakeEngine("weird", "sometimes", 1, -1)), /stage/i);
});

test("an engine whose supports() declines is skipped and does not mark the run reverted", () => {
  const b = body();
  const prev = snapshotBody(b);
  const declining = fakeEngine("declines", "lossless", 10, -50, { supports: () => false });
  const outcome = runEngine(declining, b, ctx(), { previous: prev });
  assert.equal(outcome.skipped, true);
  assert.equal(outcome.result.applied, false);
  assert.equal(outcome.result.reverted, false);
  assert.equal(b.messages[0].content.length, 200, "body untouched");
});

test("preset off selects nothing", () => {
  assert.deepEqual(presetEngines("off", listEngines()), []);
});

test("preset safe selects gate-cleared lossless engines only", () => {
  const ids = presetEngines("safe", listEngines()).map((e) => e.id);
  assert.deepEqual(ids, ["rtk"]);
});

test("preset balanced selects every gate-cleared engine, lossy included", () => {
  // Still exactly what installs ran before the registry existed. Four engines have been added
  // across two phases and none of them reached the default set, which is the point: `balanced`
  // changes when something is measured, not when something is written.
  const ids = presetEngines("balanced", listEngines()).map((e) => e.id);
  assert.deepEqual(ids, ["rtk", "caveman-en"]);
});

// The upgrade promise in one assertion: balanced is exactly what installs run today, so a new
// engine landing in the registry must not appear here until it has been measured.
test("balanced excludes any engine that has not cleared the gate, lossless ones included", () => {
  registerEngine(fakeEngine("ungated-lossy", "lossy", 200, -10, { gateCleared: false }));
  const balanced = presetEngines("balanced", listEngines()).map((e) => e.id);
  const aggressive = presetEngines("aggressive", listEngines()).map((e) => e.id);

  assert.ok(!balanced.includes("ungated-lossy"));
  assert.ok(!balanced.includes("lite"), "lite is lossless but new, so it is not in balanced");
  assert.ok(aggressive.includes("ungated-lossy"), "aggressive ships everything");
  assert.ok(aggressive.includes("lite"));
});

test("safe excludes a lossless engine that has not cleared the gate", () => {
  assert.ok(
    !presetEngines("safe", listEngines())
      .map((e) => e.id)
      .includes("lite"),
    "lossless is a claim about bytes, not about model behaviour"
  );
});

test("preset custom selects exactly the enabled ids, in registry order", () => {
  const ids = presetEngines("custom", listEngines(), { "caveman-en": true, lite: true }).map(
    (e) => e.id
  );
  assert.deepEqual(ids, ["lite", "caveman-en"]);
});

test("custom with no toggles selects nothing rather than silently falling back", () => {
  assert.deepEqual(presetEngines("custom", listEngines(), {}), []);
});

// V3: existing installs must keep running RTK + Caveman after an upgrade. Nothing was ever
// persisted, so this is the resolution of an ABSENT value — not a migration.
test("an absent compressionPreset resolves to balanced when compression is enabled", () => {
  assert.equal(resolvePreset({ contextValidation: "auto-compress" }), "balanced");
  assert.equal(resolvePreset({}), "balanced");
});

test("compression disabled resolves to off regardless of the stored preset", () => {
  assert.equal(
    resolvePreset({ contextValidation: "passthrough", compressionPreset: "aggressive" }),
    "off"
  );
});

test("a stored preset wins when compression is enabled", () => {
  assert.equal(
    resolvePreset({ contextValidation: "auto-compress", compressionPreset: "safe" }),
    "safe"
  );
});

test("an unknown preset value falls back to safe", () => {
  assert.equal(
    resolvePreset({ contextValidation: "auto-compress", compressionPreset: "turbo" }),
    "safe"
  );
});

test("the preset list is the documented five", () => {
  assert.deepEqual(COMPRESSION_PRESETS, ["off", "safe", "balanced", "aggressive", "custom"]);
});

test("selectEngines applies both the preset and supports()", () => {
  const chosen = selectEngines("safe", ctx({ rtkProfile: "off" })).map((e) => e.id);
  assert.ok(!chosen.includes("rtk"), "rtk declines when its profile is off");
});

// ── per-engine guard ────────────────────────────────────────────────────────

test("an engine that inflates reverts only its own change; the previous engine's saving survives", () => {
  const b = body();
  const shrink = fakeEngine("shrink", "lossless", 10, -100);
  const grow = fakeEngine("grow", "lossless", 20, +500);

  const first = runEngine(shrink, b, ctx(), { previous: snapshotBody(b) });
  assert.equal(first.result.reverted, false);
  assert.equal(b.messages[0].content.length, 100);

  const second = runEngine(grow, b, ctx(), { previous: first.previous });
  assert.equal(second.result.reverted, true);
  assert.equal(b.messages[0].content.length, 100, "shrink's saving survived grow's revert");
});

test("revert is index-scoped: an index the reverting engine never touched keeps its new value", () => {
  const b = body();

  const touchesBoth = {
    id: "both",
    stage: "lossless",
    order: 10,
    gateCleared: true,
    supports: () => true,
    apply(x) {
      x.messages[0].content = "A";
      x.messages[1].content = "B";
      return {
        applied: true,
        stats: {},
        bytesBefore: 400,
        bytesAfter: 2,
        touchedIndices: [0, 1],
      };
    },
  };

  const inflatesIndexZero = {
    id: "grow0",
    stage: "lossless",
    order: 20,
    gateCleared: true,
    supports: () => true,
    apply(x) {
      x.messages[0].content = "z".repeat(9999);
      return { applied: true, stats: {}, bytesBefore: 1, bytesAfter: 9999, touchedIndices: [0] };
    },
  };

  const first = runEngine(touchesBoth, b, ctx(), { previous: snapshotBody(b) });
  const second = runEngine(inflatesIndexZero, b, ctx(), { previous: first.previous });

  assert.equal(second.result.reverted, true);
  assert.equal(b.messages[0].content, "A", "index 0 restored to the pre-grow0 value");
  assert.equal(b.messages[1].content, "B", "index 1 was never touched by grow0 and must survive");
});

test("an engine reporting unknown scope reverts the whole body", () => {
  const b = body();
  const unknownScope = {
    id: "unknown",
    stage: "lossless",
    order: 10,
    gateCleared: true,
    supports: () => true,
    apply(x) {
      x.messages[0].content = "z".repeat(9999);
      x.extra = "added";
      return { applied: true, stats: {}, bytesBefore: 1, bytesAfter: 9999, touchedIndices: null };
    },
  };
  const outcome = runEngine(unknownScope, b, ctx(), { previous: snapshotBody(b) });
  assert.equal(outcome.result.reverted, true);
  assert.equal(b.messages[0].content.length, 200);
  assert.equal(b.extra, undefined, "a whole-body revert also drops keys the engine added");
});

test("an engine that reports applied:false costs no new snapshot", () => {
  const b = body();
  const prev = snapshotBody(b);
  const noop = {
    id: "noop",
    stage: "lossless",
    order: 10,
    gateCleared: true,
    supports: () => true,
    apply: () => ({ applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] }),
  };
  const outcome = runEngine(noop, b, ctx(), { previous: prev });
  assert.equal(outcome.result.applied, false);
  assert.equal(outcome.previous, prev, "the caller's snapshot is reused, not re-cloned");
});
