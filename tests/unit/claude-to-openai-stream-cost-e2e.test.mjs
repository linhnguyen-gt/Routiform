import test from "node:test";
import assert from "node:assert/strict";

// End-to-end regression suite for the translate-mode cost-undercharge bug.
//
// The prior "false green" (see claude-to-openai-response-usage.test.mjs) called
// claudeToOpenAIResponse() directly with a hand-built `state`, which bypasses
// open-sse/utils/stream.ts entirely — the exact place the real bug lived
// (`state.usage = extractUsage(parsed)` clobbering the translator's own
// accumulated usage before translateResponse() ever ran). Every test below
// drives raw provider SSE bytes through the real, unmocked
// createSSETransformStreamWithLogger()/createPassthroughStreamWithLogger()
// pipeline and asserts the FINAL billed cost, hand-computed.
const { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger } =
  await import("../../open-sse/utils/stream.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { computeCostFromPricing } = await import("../../src/lib/usage/costCalculator.ts");
const { extractUsageFromResponse } = await import("../../open-sse/handlers/usageExtractor.ts");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Matches the PRICING fixture used by tests/unit/cost-calculator-cache-fix.test.mjs
// (rates per 1,000,000 tokens).
const PRICING = { input: 3.0, output: 15.0, cached: 1.5, reasoning: 22.5, cache_creation: 3.0 };

// Shared fixture across scenarios: Anthropic upstream usage —
// input=3000 (cache-EXCLUSIVE), cache_read=1000, cache_creation=5000, output=500.
const MESSAGE_START =
  'data: {"type":"message_start","message":{"id":"msg_e2e","model":"claude-sonnet-4-6","usage":{"input_tokens":3000,"output_tokens":0,"cache_read_input_tokens":1000,"cache_creation_input_tokens":5000}}}\n\n';
const CONTENT_BLOCK_START =
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n';
const CONTENT_BLOCK_DELTA =
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n';
// The bug trigger: message_delta carrying ONLY output_tokens — the common
// Anthropic shape. No input_tokens/cache_read_input_tokens/cache_creation_input_tokens keys.
const MESSAGE_DELTA_OUTPUT_ONLY =
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":500}}\n\n';
// The already-fixed shape: message_delta repeats the full usage snapshot.
const MESSAGE_DELTA_FULL_REPEAT =
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":3000,"output_tokens":500,"cache_read_input_tokens":1000,"cache_creation_input_tokens":5000}}\n\n';
const MESSAGE_STOP = 'data: {"type":"message_stop"}\n\n';

// Correct, hand-computed cost for input=3000(excl) / cache_read=1000 / cache_creation=5000 / output=500:
//   nonCachedInput(3000) * 3.00/1e6
// + cacheRead(1000)      * 1.50/1e6
// + cacheCreation(5000)  * 3.00/1e6
// + output(500)          * 15.00/1e6
// = 0.009 + 0.0015 + 0.015 + 0.0075 = 0.033
const EXPECTED_COST =
  3000 * (3.0 / 1_000_000) +
  1000 * (1.5 / 1_000_000) +
  5000 * (3.0 / 1_000_000) +
  500 * (15.0 / 1_000_000);
assert.ok(Math.abs(EXPECTED_COST - 0.033) < 1e-9);

// The bug's undercharge: only the 500 output tokens billed, all 9000 prompt-side
// tokens (input + cache_read + cache_creation) dropped to $0.
const BUGGY_COST = 500 * (15.0 / 1_000_000);
assert.ok(Math.abs(BUGGY_COST - 0.0075) < 1e-9);

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

// --- Case 1 (CRITICAL): message_delta with output_tokens ONLY, Claude -> OpenAI ---

test("E2E Claude->OpenAI translate: message_delta with output_tokens ONLY must not zero out prompt cost", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    "anthropic",
    null,
    null,
    "claude-sonnet-4-6",
    "conn-e2e-1",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  const output = await driveStream(stream, [
    MESSAGE_START,
    CONTENT_BLOCK_START,
    CONTENT_BLOCK_DELTA,
    MESSAGE_DELTA_OUTPUT_ONLY,
    MESSAGE_STOP,
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(usage.input_tokens, 3000, "input_tokens must survive the output-only message_delta");
  assert.equal(usage.cache_read_input_tokens, 1000);
  assert.equal(usage.cache_creation_input_tokens, 5000);
  assert.equal(usage.completion_tokens, 500);

  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - EXPECTED_COST) < 1e-9, `expected ${EXPECTED_COST}, got ${cost}`);
  assert.notEqual(cost, BUGGY_COST);

  // The client-visible final chunk must also carry the correct, non-zero
  // prompt_tokens — not just the internal accounting object. The client-facing
  // value may additionally include the safety buffer (see
  // usageTracking.ts#addBufferToUsage, up to DEFAULT_BUFFER_TOKENS=2000) which
  // only ever ADDS to prompt-side tokens, never to completion_tokens — so
  // completion_tokens must equal 500 exactly, and prompt_tokens must be at
  // least the true 9000 (never the buggy near-zero value).
  const finalUsageLine = output
    .split("\n")
    .filter((line) => line.startsWith("data:") && line.includes('"prompt_tokens"'))
    .map((line) => JSON.parse(line.slice(5).trim()))
    .find((chunk) => chunk.usage);
  assert.ok(finalUsageLine, "expected a client-facing chunk carrying usage");
  assert.ok(
    finalUsageLine.usage.prompt_tokens >= 9000,
    `expected prompt_tokens >= 9000 (got ${finalUsageLine.usage.prompt_tokens})`
  );
  assert.equal(finalUsageLine.usage.completion_tokens, 500);
});

// --- Case 2: message_delta repeating full usage (already fixed; must not regress) ---

test("E2E Claude->OpenAI translate: message_delta repeating full usage stays correct", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    "anthropic",
    null,
    null,
    "claude-sonnet-4-6",
    "conn-e2e-2",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    MESSAGE_START,
    CONTENT_BLOCK_START,
    CONTENT_BLOCK_DELTA,
    MESSAGE_DELTA_FULL_REPEAT,
    MESSAGE_STOP,
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - EXPECTED_COST) < 1e-9, `expected ${EXPECTED_COST}, got ${cost}`);
});

// --- Case 3: Claude -> Claude passthrough, both message_delta shapes (must not regress) ---

test("E2E Claude->Claude passthrough: output-only message_delta keeps correct cost", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "anthropic",
    null,
    null,
    "claude-sonnet-4-6",
    "conn-e2e-3",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    MESSAGE_START,
    CONTENT_BLOCK_START,
    CONTENT_BLOCK_DELTA,
    MESSAGE_DELTA_OUTPUT_ONLY,
    MESSAGE_STOP,
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - EXPECTED_COST) < 1e-9, `expected ${EXPECTED_COST}, got ${cost}`);
});

test("E2E Claude->Claude passthrough: message_delta repeating full usage keeps correct cost", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createPassthroughStreamWithLogger(
    "anthropic",
    null,
    null,
    "claude-sonnet-4-6",
    "conn-e2e-4",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    MESSAGE_START,
    CONTENT_BLOCK_START,
    CONTENT_BLOCK_DELTA,
    MESSAGE_DELTA_FULL_REPEAT,
    MESSAGE_STOP,
    "data: [DONE]\n\n",
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - EXPECTED_COST) < 1e-9, `expected ${EXPECTED_COST}, got ${cost}`);
});

// --- Case 5: provider with no cache fields at all (translate mode) ---

test("E2E Claude->OpenAI translate: provider with no cache fields bills plain input+output", async () => {
  const { onComplete, calls } = captureOnComplete();
  const stream = createSSETransformStreamWithLogger(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    "opencode-go",
    null,
    null,
    "some-model",
    "conn-e2e-5",
    { messages: [{ role: "user", content: "hi" }] },
    onComplete,
    null
  );

  await driveStream(stream, [
    'data: {"type":"message_start","message":{"id":"msg_nocache","model":"some-model","usage":{"input_tokens":1000,"output_tokens":0}}}\n\n',
    CONTENT_BLOCK_START,
    CONTENT_BLOCK_DELTA,
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":200}}\n\n',
    MESSAGE_STOP,
  ]);

  assert.equal(calls.length, 1);
  const usage = calls[0].usage;
  assert.equal(
    usage.input_tokens,
    1000,
    "input_tokens must survive even with no cache fields present"
  );
  assert.equal(usage.completion_tokens, 200);
  assert.ok(!usage.cache_read_input_tokens);
  assert.ok(!usage.cache_creation_input_tokens);

  const expected = 1000 * (3.0 / 1_000_000) + 200 * (15.0 / 1_000_000);
  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - expected) < 1e-9, `expected ${expected}, got ${cost}`);
});

// --- Case 6: non-stream Anthropic-shaped body with cache_read but NO cache_creation ---
//
// This proves the HIGH-priority usageExtractor.ts fix is format-driven, not a
// field-presence guess: an Anthropic-shaped body with a genuinely absent
// cache_creation_input_tokens field (a valid, spec-compliant Anthropic response
// — the field is just 0/omitted) is still read as cache-EXCLUSIVE because the
// "anthropic" provider id resolves to FORMATS.CLAUDE via the registry
// (services/provider.ts#getTargetFormat), not because of what fields happen to
// be present on this particular response.

test("E2E non-stream: Anthropic-shaped body with cache_read but no cache_creation is billed cache-exclusive", () => {
  const responseBody = {
    id: "msg_no_cache_creation",
    type: "message",
    usage: {
      input_tokens: 3000,
      output_tokens: 500,
      cache_read_input_tokens: 1000,
      // cache_creation_input_tokens intentionally absent.
    },
  };

  const usage = extractUsageFromResponse(responseBody, "anthropic");
  assert.equal(usage.prompt_tokens, 4000, "3000 (exclusive) + 1000 (cache read) + 0 (no creation)");
  assert.equal(usage.completion_tokens, 500);
  assert.equal(usage.cache_read_input_tokens, 1000);
  assert.equal(usage.cache_creation_input_tokens, 0);

  const correctCost =
    3000 * (3.0 / 1_000_000) + // non-cached input, exclusive — must NOT be reduced further
    1000 * (1.5 / 1_000_000) + // cache read
    500 * (15.0 / 1_000_000); // output
  const cost = computeCostFromPricing(PRICING, usage);
  assert.ok(Math.abs(cost - correctCost) < 1e-9, `expected ${correctCost}, got ${cost}`);

  // Regression guard: the pre-fix `cache_creation_input_tokens !== undefined`
  // gate would have misclassified this as an OpenAI Responses body and read
  // input_tokens=3000 as already cache-INCLUSIVE, subtracting cache_read from it.
  const buggyNonCachedInput = Math.max(0, 3000 - 1000);
  const buggyCost =
    buggyNonCachedInput * (3.0 / 1_000_000) + 1000 * (1.5 / 1_000_000) + 500 * (15.0 / 1_000_000);
  assert.notEqual(cost, buggyCost);
  assert.ok(
    cost > buggyCost,
    "correct (exclusive) reading must bill more than the buggy (inclusive) reading"
  );
});
