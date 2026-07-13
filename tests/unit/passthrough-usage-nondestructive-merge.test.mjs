import test from "node:test";
import assert from "node:assert/strict";

// Regression suite for the passthrough-mode usage undercharge:
// createSSEStream()'s PASSTHROUGH branches (Responses SSE, OpenAI Chat Completions
// SSE) assign extracted usage destructively (`usage = extracted`), so a LATER SSE
// frame carrying partial/zero usage wipes cache/prompt tokens captured from an
// EARLIER frame. Passthrough is the common path (same-format client -> provider),
// so this is a live undercharge for most traffic, not just translate mode.
//
// These tests drive the real, unmocked createPassthroughStreamWithLogger() pipeline
// (open-sse/utils/stream.ts) with two SSE frames: an early one with complete usage
// (prompt/input tokens + cache fields), a later one with partial/near-zero usage —
// and assert the final usage retains the cache/prompt data instead of being
// clobbered.
const { createPassthroughStreamWithLogger } = await import("../../open-sse/utils/stream.ts");

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

// --- Site stream.ts:555 — OpenAI Chat Completions SSE passthrough ---

test("Passthrough OpenAI SSE: later near-zero usage frame must not wipe earlier prompt/cache tokens", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "opencompatible",
    null,
    null,
    "some-model",
    "conn-passthrough-openai-1",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    // Early frame: complete usage (prompt tokens + cached tokens)
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"},"finish_reason":null}],"usage":{"prompt_tokens":9000,"completion_tokens":0,"prompt_tokens_details":{"cached_tokens":1000}}}\n\n',
    // Later frame: finish chunk repeats usage but with prompt_tokens reset to 0
    // (some providers send a near-empty usage snapshot on later deltas).
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":0,"completion_tokens":500}}\n\n',
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(usage.completion_tokens, 500);
  assert.ok(
    usage.prompt_tokens >= 9000,
    `expected prompt_tokens to survive (>=9000), got ${usage.prompt_tokens}`
  );
  assert.equal(usage.cached_tokens, 1000, "cached_tokens from the early frame must survive");
});

// --- Site stream.ts:396 — OpenAI Responses SSE passthrough ---

test("Passthrough Responses SSE: later near-zero usage frame must not wipe earlier prompt/cache tokens", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "opencompatible-responses",
    null,
    null,
    "some-model",
    "conn-passthrough-responses-1",
    { input: "hi" },
    onComplete,
    null
  );

  await driveStream(stream, [
    'data: {"type":"response.output_text.delta","delta":"hi"}\n\n',
    // Early frame: complete usage
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":9000,"output_tokens":0,"input_tokens_details":{"cached_tokens":1000}}}}\n\n',
    // Later frame: a duplicate/retry-style completion event with near-zero usage
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":0,"output_tokens":500}}}\n\n',
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(usage.completion_tokens, 500);
  assert.ok(
    usage.prompt_tokens >= 9000,
    `expected prompt_tokens to survive (>=9000), got ${usage.prompt_tokens}`
  );
  assert.equal(usage.cached_tokens, 1000, "cached_tokens from the early frame must survive");
});

// --- Site stream.ts:823 (translate mode) — an estimate must never clobber a
// real reported value already accumulated in state.usage, even when the
// specific translated item that happens to trigger isFinishChunk doesn't
// itself carry a `.usage` field.
//
// CommandCode's response translator (open-sse/translator/response/commandcode-to-openai.ts)
// sets state.finishReason + state.usage on a "finish-step" event (no item emitted
// for that event), then a later "error" event emits a finish_reason-bearing item
// with NO usage attached. That is a real, currently-registered translator shape
// that exercises this exact gap.

test("Translate mode: estimate must not clobber real usage already accumulated in state.usage", async () => {
  const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.ts");
  const { FORMATS } = await import("../../open-sse/translator/formats.ts");

  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.COMMANDCODE,
    FORMATS.OPENAI,
    "commandcode",
    null,
    null,
    "some-model",
    "conn-translate-estimate-1",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    'data: {"type":"text-delta","text":"hi"}\n\n',
    // Real usage reported on finish-step — no item is emitted for this event,
    // but state.finishReason and state.usage are both set.
    'data: {"type":"finish-step","finishReason":"stop","usage":{"input_tokens":3000,"output_tokens":500}}\n\n',
    // Error event emits a finish_reason-bearing item with no usage attached.
    'data: {"type":"error","error":"boom"}\n\n',
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.ok(!usage.estimated, "real reported usage must not be replaced by a heuristic estimate");
  assert.equal(usage.input_tokens, 3000, "real input_tokens must survive");
  assert.equal(usage.output_tokens, 500, "real output_tokens must survive");
});
