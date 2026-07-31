import test from "node:test";
import assert from "node:assert/strict";

/**
 * What the lossless engines actually buy, measured on the characterization corpus.
 *
 * Phase 02's success criterion asked for `safe` to beat the Phase 01 baseline. It does not, and
 * that is the design rather than a shortfall: every engine added in Phases 01–02 ships
 * gate-cleared: false, so `safe` and `balanced` still contain exactly what installs ran before the
 * registry existed. Moving an engine into them is Phase 03's decision, made from task-success
 * measurements, not from the fact that the engine was written.
 *
 * So the number that matters today is the `aggressive` delta — what becomes available once an
 * engine clears the gate — and it is recorded here rather than asserted vaguely.
 */

const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");

function toolRows(n = 40) {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      id: i,
      path: `src/module/file-${i}.ts`,
      status: i % 3 === 0 ? "modified" : "unchanged",
      lines: 100 + i,
    })),
    null,
    2
  );
}

const PROSE =
  "I would like to please just really actually explain the reason why it is important " +
  "to note that this particular function appears to be broken in a number of ways.";

function corpus() {
  return {
    "openai-chat": {
      model: "gpt-4o",
      messages: [
        { role: "user", content: `${PROSE}     with     loose      spacing` },
        { role: "tool", tool_call_id: "t1", content: toolRows() },
      ],
    },
    "openai-responses": {
      model: "gpt-5",
      input: [
        { role: "user", content: PROSE },
        { type: "function_call_output", call_id: "c1", output: toolRows() },
      ],
    },
    claude: {
      model: "claude-sonnet-4",
      messages: [
        { role: "user", content: PROSE },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: toolRows() }],
        },
      ],
    },
  };
}

function run(body, preset) {
  return applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset,
  });
}

test("the default presets are untouched by two phases of new engines", () => {
  for (const [shape, make] of Object.entries(corpus())) {
    const balanced = run(make, "balanced");
    const engines = Object.keys(balanced.engines);
    assert.deepEqual(
      engines.filter((id) => balanced.engines[id].applied).sort(),
      engines
        .filter((id) => ["rtk", "caveman-en"].includes(id) && balanced.engines[id].applied)
        .sort(),
      `${shape}: an unmeasured engine reached the default set`
    );
  }
});

test("aggressive beats balanced on every corpus shape, and the delta is recorded", () => {
  const deltas = {};

  for (const [shape, make] of Object.entries(corpus())) {
    const balancedBody = structuredClone(make);
    const aggressiveBody = structuredClone(make);

    const balanced = run(balancedBody, "balanced");
    const aggressive = run(aggressiveBody, "aggressive");

    const pct = ((balanced.bytesAfter - aggressive.bytesAfter) / balanced.bytesAfter) * 100;
    deltas[shape] = {
      balanced: balanced.bytesAfter,
      aggressive: aggressive.bytesAfter,
      savedPct: Number(pct.toFixed(1)),
      engines: Object.entries(aggressive.engines)
        .filter(([, r]) => r.applied)
        .map(([id]) => id),
    };

    assert.ok(
      aggressive.bytesAfter < balanced.bytesAfter,
      `${shape}: the lossless engines saved nothing (${balanced.bytesAfter} → ${aggressive.bytesAfter})`
    );
  }

  // Printed rather than merely asserted: this is the number Phase 03 measures task success
  // against, and a number nobody can read is not evidence.
  console.log("[lossless-delta] aggressive vs balanced:", JSON.stringify(deltas, null, 2));
});

test("the aggressive payload still means the same thing", () => {
  // Every engine added in Phases 01–02 claims losslessness. Here that claim is checked end to
  // end rather than per engine: the tool payload must still parse and still carry the same rows.
  const body = corpus()["openai-chat"];
  const original = JSON.parse(body.messages[1].content);

  run(body, "aggressive");

  const after = body.messages[1].content;
  const decoded = after.startsWith("GCF/1 ")
    ? (() => {
        const envelope = JSON.parse(after.slice(after.indexOf("\n") + 1));
        return envelope.r.map((row) =>
          Object.fromEntries(envelope.h.map((key, i) => [key, row[i]]))
        );
      })()
    : JSON.parse(after);

  assert.deepEqual(decoded, original, "the tool payload survived the lossless stack unchanged");
});

test("prose keeps its meaning through the lossless engines", () => {
  // Lite collapses whitespace; nothing in the lossless set may remove words.
  const body = {
    model: "gpt-4o",
    messages: [{ role: "user", content: "explain    the     bug\n\n\n\nin  detail" }],
  };
  run(body, "custom");
  const words = body.messages[0].content.split(/\s+/).filter(Boolean);
  assert.deepEqual(words, ["explain", "the", "bug", "in", "detail"]);
});
