import test from "node:test";
import assert from "node:assert/strict";

const { gcfEngine } = await import("../../open-sse/compression/engines/gcf-engine.ts");
const { decodeTabular } = await import("../../open-sse/compression/engines/gcf-codec.ts");

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

const rows = (n = 30) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    status: i % 2 ? "pending" : "done",
    owner: `user-${i}`,
  }));

/** Pull the envelope back out of an encoded payload and prove it decodes to the original. */
function assertRoundTrip(encoded, original) {
  const jsonLine = encoded.slice(encoded.indexOf("\n") + 1);
  assert.deepEqual(decodeTabular(JSON.parse(jsonLine)), original);
}

test("encodes a JSON array in an OpenAI tool message and stays semantically equal", () => {
  const original = rows();
  const body = { messages: [{ role: "tool", content: JSON.stringify(original) }] };
  const res = gcfEngine.apply(body, ctx());

  assert.equal(res.applied, true);
  assert.ok(res.bytesAfter < res.bytesBefore);
  assert.deepEqual(res.touchedIndices, [0]);
  assertRoundTrip(body.messages[0].content, original);
});

test("encodes a Claude tool_result, string and array forms", () => {
  const original = rows();
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: JSON.stringify(original) },
          {
            type: "tool_result",
            tool_use_id: "b",
            content: [{ type: "text", text: JSON.stringify(original) }],
          },
        ],
      },
    ],
  };
  const res = gcfEngine.apply(body, ctx({ bodyShape: "claude" }));
  assert.equal(res.applied, true);
  assertRoundTrip(body.messages[0].content[0].content, original);
  assertRoundTrip(body.messages[0].content[1].content[0].text, original);
});

test("encodes an OpenAI Responses function_call_output", () => {
  const original = rows();
  const body = {
    input: [{ type: "function_call_output", call_id: "c1", output: JSON.stringify(original) }],
  };
  const res = gcfEngine.apply(body, ctx({ bodyShape: "openai-responses" }));
  assert.equal(res.applied, true);
  assertRoundTrip(body.input[0].output, original);
});

test("leaves an is_error tool_result verbatim", () => {
  const original = JSON.stringify(rows());
  const body = {
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "a", is_error: true, content: original }],
      },
    ],
  };
  const res = gcfEngine.apply(body, ctx({ bodyShape: "claude" }));
  assert.equal(res.applied, false);
  assert.equal(body.messages[0].content[0].content, original);
});

test("never touches prose, however array-like it looks", () => {
  const body = {
    messages: [
      { role: "user", content: JSON.stringify(rows()) },
      { role: "assistant", content: JSON.stringify(rows()) },
      { role: "system", content: JSON.stringify(rows()) },
    ],
  };
  const before = JSON.stringify(body);
  const res = gcfEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(body), before, "a user message that happens to be JSON is not data");
});

test("declines tool output that is not a qualifying array", () => {
  const cases = [
    "plain text output",
    JSON.stringify({ not: "an array" }),
    JSON.stringify([1, 2, 3]),
    JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: i }))),
    "",
  ];
  for (const content of cases) {
    const body = { messages: [{ role: "tool", content }] };
    const before = JSON.stringify(body);
    const res = gcfEngine.apply(body, ctx());
    assert.equal(res.applied, false, `unexpectedly encoded: ${content.slice(0, 40)}`);
    assert.equal(JSON.stringify(body), before);
  }
});

test("declines heterogeneous rows rather than padding them", () => {
  const mixed = rows();
  mixed[7] = { id: 7 };
  const body = { messages: [{ role: "tool", content: JSON.stringify(mixed) }] };
  const res = gcfEngine.apply(body, ctx());
  assert.equal(res.applied, false);
});

test("reports only the indices it touched", () => {
  const body = {
    messages: [
      { role: "user", content: "what is in the table" },
      { role: "tool", content: JSON.stringify(rows()) },
      { role: "tool", content: "not json" },
      { role: "tool", content: JSON.stringify(rows()) },
    ],
  };
  const res = gcfEngine.apply(body, ctx());
  assert.deepEqual(res.touchedIndices, [1, 3]);
});

test("ships out of the default set until its comprehension is measured", () => {
  // Lossless by proof, unproven by comprehension: a model may simply read the tabular form worse.
  // That is Phase 03's measurement to make, so this stays out of `safe` and `balanced`.
  assert.equal(gcfEngine.stage, "lossless");
  assert.equal(gcfEngine.gateCleared, false);
});

test("declines body shapes it cannot walk", () => {
  assert.equal(gcfEngine.supports(ctx({ bodyShape: "kiro" })), false);
  assert.equal(gcfEngine.supports(ctx({ bodyShape: "unknown" })), false);
  assert.equal(gcfEngine.supports(ctx({ bodyShape: "claude" })), true);
});

test("the encoded payload carries a legend the model can act on", () => {
  const body = { messages: [{ role: "tool", content: JSON.stringify(rows()) }] };
  gcfEngine.apply(body, ctx());
  const [firstLine] = body.messages[0].content.split("\n");
  assert.ok(firstLine.startsWith("GCF/1 "));
  assert.ok(firstLine.includes("row[i] corresponds to h[i]"));
});
