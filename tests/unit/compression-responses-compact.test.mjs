import test from "node:test";
import assert from "node:assert/strict";

const { responsesCompactEngine } =
  await import("../../open-sse/compression/engines/responses-compact.ts");
const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");

function ctx(overrides = {}) {
  return {
    provider: "openai",
    model: "gpt-5",
    userAgent: "curl/8.0",
    rtkProfile: "full",
    bodyShape: "openai-responses",
    conversationId: null,
    apiKeyId: null,
    touchedSoFar: new Set(),
    ...overrides,
  };
}

const pretty = (value) => JSON.stringify(value, null, 2);

const payload = () => ({
  results: Array.from({ length: 12 }, (_, i) => ({ id: i, label: `row ${i}`, ok: i % 2 === 0 })),
  meta: { total: 12, truncated: false },
});

test("compacts a pretty-printed function_call_output and preserves meaning exactly", () => {
  const original = payload();
  const body = {
    input: [{ type: "function_call_output", call_id: "c1", output: pretty(original) }],
  };

  const res = responsesCompactEngine.apply(body, ctx());

  assert.equal(res.applied, true);
  assert.ok(res.bytesAfter < res.bytesBefore);
  assert.deepEqual(JSON.parse(body.input[0].output), original, "semantic equality, not similarity");
});

test("compacts the array form of output", () => {
  const original = payload();
  const body = {
    input: [
      {
        type: "function_call_output",
        call_id: "c1",
        output: [{ type: "input_text", text: pretty(original) }],
      },
    ],
  };
  const res = responsesCompactEngine.apply(body, ctx());
  assert.equal(res.applied, true);
  assert.deepEqual(JSON.parse(body.input[0].output[0].text), original);
});

test("skips an index an earlier engine already rewrote", () => {
  // The whole reason this engine reads a skip set. RTK's filters emit truncation markers that are
  // not JSON; a second pass over them is at best a no-op and at worst corrupts the filter output.
  const body = {
    input: [
      { type: "function_call_output", call_id: "c1", output: pretty(payload()) },
      { type: "function_call_output", call_id: "c2", output: pretty(payload()) },
    ],
  };
  const before = body.input[0].output;

  const res = responsesCompactEngine.apply(body, ctx({ touchedSoFar: new Set([0]) }));

  assert.deepEqual(res.touchedIndices, [1], "only the untouched index was compacted");
  assert.equal(body.input[0].output, before, "the skipped index is byte-identical");
  assert.equal(res.stats.skippedAfterEarlierEngines, 1);
});

test("declines output that is not JSON", () => {
  const body = {
    input: [
      {
        type: "function_call_output",
        call_id: "c1",
        // What an RTK filter leaves behind: real content with an elision marker in the middle.
        output: "line 1\n... 400 lines elided ...\nline 402",
      },
    ],
  };
  const before = JSON.stringify(body);
  const res = responsesCompactEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(body), before);
});

test("declines output that is already compact", () => {
  const body = {
    input: [{ type: "function_call_output", call_id: "c1", output: JSON.stringify(payload()) }],
  };
  const res = responsesCompactEngine.apply(body, ctx());
  assert.equal(res.applied, false);
});

test("declines short payloads where the parse costs more than it saves", () => {
  const body = {
    input: [{ type: "function_call_output", call_id: "c1", output: '{\n "a": 1\n}' }],
  };
  assert.equal(responsesCompactEngine.apply(body, ctx()).applied, false);
});

test("only applies to the Responses shape", () => {
  assert.equal(responsesCompactEngine.supports(ctx({ bodyShape: "openai-responses" })), true);
  for (const shape of ["openai-chat", "claude", "kiro", "unknown"]) {
    assert.equal(responsesCompactEngine.supports(ctx({ bodyShape: shape })), false, shape);
  }
});

test("leaves a Claude tool_result untouched even if it is reached", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: pretty(payload()) }],
      },
    ],
  };
  const before = JSON.stringify(body);
  const res = responsesCompactEngine.apply(body, ctx({ bodyShape: "claude" }));
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(body), before);
});

test("stays out of the default engine set", () => {
  assert.equal(responsesCompactEngine.stage, "lossless");
  assert.equal(responsesCompactEngine.gateCleared, false);
});

// ── through the real pipeline ───────────────────────────────────────────────

test("under aggressive, RTK's output is never re-compacted by the pipeline", () => {
  // An end-to-end version of the skip: RTK truncates a long tool output, and compaction must not
  // then try to JSON round-trip whatever RTK left behind.
  const lines = ["diff --git a/s b/s"];
  for (let i = 0; i < 200; i++)
    lines.push(`-old ${i} padding padding`, `+new ${i} padding padding`);

  const body = {
    model: "gpt-5",
    input: [
      { role: "user", content: "review this" },
      { type: "function_call_output", call_id: "c1", output: lines.join("\n") },
      { type: "function_call_output", call_id: "c2", output: pretty(payload()) },
    ],
  };

  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "aggressive",
  });

  const rtk = result.engines.rtk;
  const compact = result.engines["responses-compact"];
  assert.ok(rtk?.applied, "RTK should have filtered the diff");
  assert.ok(Array.isArray(rtk.touchedIndices), "RTK must report a real scope for the skip to work");

  if (compact?.applied) {
    for (const index of rtk.touchedIndices) {
      assert.ok(
        !compact.touchedIndices.includes(index),
        `compaction touched index ${index}, which RTK had already rewritten`
      );
    }
  }
  // The untouched pretty-printed payload is still valid JSON and still means the same thing.
  assert.deepEqual(JSON.parse(body.input[2].output), payload());
});
