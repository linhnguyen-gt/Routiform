import test from "node:test";
import assert from "node:assert/strict";

// Regression suite for three usage/billing defects found in the real
// createSSEStream() pipeline (open-sse/utils/stream.ts). Each test drives the
// unmocked pipeline entry points (createPassthroughStreamWithLogger /
// createSSETransformStreamWithLogger) with a concrete SSE frame sequence, not
// a hand-built state object.
const { createPassthroughStreamWithLogger, createSSETransformStreamWithLogger } =
  await import("../../open-sse/utils/stream.ts");
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
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
  decoder.decode();
}

// --- Bug 1: choices-less final usage frame is dead-code for accounting ---
//
// OpenAI's stream_options.include_usage FINAL frame is exactly
// {"choices":[],"usage":{...}} — no choices[0].delta. hasValuableContent()
// returns false for it, so the current code `continue`s ~87 lines before
// ever reaching extractUsage()/mergeUsageNonDestructive() for that frame.
// The finish_reason frame (which DOES have choices[0]) arrives first with no
// usage attached, triggering a heuristic estimate that then never gets
// corrected by the real numbers in the later choices-less frame.
test("Passthrough: choices-less final usage frame must be accounted (not dead code)", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "opencompatible",
    null,
    null,
    "some-model",
    "conn-bug1-choices-less-usage",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"}}]}\n\n',
    // Finish chunk carries no usage — real usage arrives in a SEPARATE,
    // choices-less frame right after it (OpenAI's actual include_usage shape).
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":57,"completion_tokens":3,"total_tokens":60}}\n\n',
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(
    usage.prompt_tokens,
    57,
    `expected real prompt_tokens=57, got ${usage.prompt_tokens}`
  );
  assert.equal(
    usage.completion_tokens,
    3,
    `expected real completion_tokens=3, got ${usage.completion_tokens}`
  );
  assert.ok(!usage.estimated, "final usage must not be marked estimated once real numbers arrive");
});

// --- Bug 2: the estimate gate is OR-across-fields, so ONE positive prompt
// field suppresses the output-token estimate entirely, billing 0 output
// tokens for a response that produced real content.
//
// Reproduces a GLM/Kimi/Bedrock-style Claude-compatible gateway: message_start
// reports real input tokens, message_delta carries no usage at all (so the
// translator's own state.usage carry-forward logic keeps completion_tokens
// at 0 without ever re-estimating it).
test("Translate mode: estimate gate must be per-side — real prompt kept, zero completion re-estimated", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    "claude-compatible-gateway",
    null,
    null,
    "some-model",
    "conn-bug2-per-side-gate",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    'data: {"type":"message_start","message":{"id":"msg_1","model":"m","usage":{"input_tokens":500,"output_tokens":0}}}\n\n',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello world, this is real content"}}\n\n',
    // message_delta carries NO usage field at all — gateway never reports output tokens.
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
    'data: {"type":"message_stop"}\n\n',
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(
    usage.prompt_tokens,
    500,
    `expected real prompt_tokens=500 preserved, got ${usage.prompt_tokens}`
  );
  assert.ok(
    usage.completion_tokens > 0,
    `expected completion_tokens to be re-estimated (>0) for real content, got ${usage.completion_tokens}`
  );
});

// --- Bug 3: mergeUsageNonDestructive drops details objects and lets an
// `estimated: true` flag survive onto real merged numbers.
//
// DashScope/Qwen-style provider: usage (without cache-creation detail) on an
// early chunk, cache-creation detail arrives ONLY on the final chunk that
// also repeats prompt_tokens. The old scalar-only merge discards
// prompt_tokens_details entirely once target is non-null.
test("Passthrough: mergeUsageNonDestructive must preserve prompt_tokens_details/completion_tokens_details across chunks", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "opencompatible",
    null,
    null,
    "some-model",
    "conn-bug3-details-merge",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    // Early chunk: usage with prompt/completion but no details yet.
    'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"},"finish_reason":null}],"usage":{"prompt_tokens":1000,"completion_tokens":0}}\n\n',
    // Final chunk: repeats prompt_tokens, adds cache_creation_tokens detail.
    'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":50,"prompt_tokens_details":{"cache_creation_tokens":800}}}\n\n',
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(usage.prompt_tokens, 1000);
  assert.equal(usage.completion_tokens, 50);
  assert.ok(
    usage.prompt_tokens_details && usage.prompt_tokens_details.cache_creation_tokens === 800,
    `expected prompt_tokens_details.cache_creation_tokens=800 to survive the merge, got ${JSON.stringify(usage.prompt_tokens_details)}`
  );
});
