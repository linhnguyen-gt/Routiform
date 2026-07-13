import test from "node:test";
import assert from "node:assert/strict";

// Regression test for: CommandCode upstream reports AI-SDK-v5-shaped
// (camelCase inputTokens/outputTokens) usage on "finish-step". The
// translator's own `state.usage = event.usage` (commandcode-to-openai.ts)
// stored that camelCase object verbatim into the SHARED translator state
// (same object stream.ts holds — translateResponse(targetFormat, sourceFormat,
// chunk, state) passes it through unchanged). The shared cost-tracking gate
// `hasValidUsage()` (open-sse/utils/usageTracking.ts) only recognizes
// snake_case fields (prompt_tokens/input_tokens/etc.), so it read the reported
// usage as ABSENT and let open-sse/utils/stream.ts:1051 (and the earlier
// per-chunk gate at stream.ts:809-816) overwrite it with a heuristic
// character-count ESTIMATE — even though the provider had already reported
// the real number. This drives raw CommandCode NDJSON/SSE bytes through the
// real, unmocked createSSETransformStreamWithLogger() pipeline (not a
// hand-built state) and asserts the final billed usage matches the REPORTED
// tokens, not an estimate.
const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function captureOnComplete() {
  const calls = [];
  return { onComplete: (payload) => calls.push(payload), calls };
}

async function driveStream(stream, sseLines) {
  const writer = stream.writable.getWriter();
  for (const line of sseLines) {
    await writer.write(encoder.encode(line));
  }
  await writer.close();

  const reader = stream.readable.getReader();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
}

test("E2E CommandCode->OpenAI translate: reported camelCase usage on finish-step must not be replaced by an estimate", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.COMMANDCODE,
    FORMATS.OPENAI,
    "commandcode",
    null,
    null,
    "some-commandcode-model",
    "conn-cc-e2e-1",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  // Real upstream shape: a long text delta (so heuristic estimation has
  // something to latch onto if the real usage is wrongly discarded), then a
  // finish-step reporting REAL usage in AI-SDK-v5 camelCase, then a bare
  // finish event with no repeated totalUsage (the common shape — usage is
  // only reported once, on finish-step).
  const longText = "word ".repeat(400); // long enough that a heuristic estimate would differ sharply from 100/50
  await driveStream(stream, [
    'data: {"type":"start"}\n\n',
    'data: {"type":"start-step"}\n\n',
    'data: {"type":"text-start","id":"1"}\n\n',
    `data: {"type":"text-delta","id":"1","text":${JSON.stringify(longText)}}\n\n`,
    'data: {"type":"finish-step","finishReason":"stop","usage":{"inputTokens":100,"outputTokens":50,"totalTokens":150}}\n\n',
    'data: {"type":"finish","finishReason":"stop"}\n\n',
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.ok(usage, "expected usage to be recorded");
  assert.equal(usage.prompt_tokens, 100, "must reflect the REPORTED input tokens, not an estimate");
  assert.equal(
    usage.completion_tokens,
    50,
    "must reflect the REPORTED output tokens, not an estimate"
  );
  assert.ok(!usage.estimated, "usage must not be flagged as a heuristic estimate");
});
