/**
 * The dedupe fingerprint must cover the request whatever format it is in.
 *
 * Inflight dedupe runs on the body that is about to go upstream, which is already
 * in the provider's own format. A fingerprint that only reads OpenAI's field names
 * (`messages`, `input`, `instructions`) sees nothing in a Gemini/Cloud Code body —
 * so every antigravity request on one model hashed the same, and two concurrent
 * ones collapsed into a single upstream call whose response was handed to both
 * callers. Oh My Pi hit this on every turn: its title generator and the chat turn
 * fire together, and the chat turn was served the title's reply.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRequestHash,
  detectSideEffect,
  setDedupConfig,
  shouldDeduplicate,
} from "../../open-sse/services/requestDedup.ts";

/** The Cloud Code envelope the antigravity executor receives. */
function geminiBody(request = {}) {
  return {
    model: "antigravity/gemini-3.6-flash-high",
    stream: true,
    request: {
      contents: [{ role: "user", parts: [{ text: "hihi" }] }],
      generationConfig: { temperature: 0 },
      ...request,
    },
  };
}

test("two Gemini bodies with different prompts do not share a fingerprint", () => {
  const alpha = computeRequestHash(geminiBody());
  const bravo = computeRequestHash(
    geminiBody({ contents: [{ role: "user", parts: [{ text: "something else" }] }] })
  );

  assert.notEqual(alpha, bravo);
});

test("a Gemini system instruction is part of the fingerprint", () => {
  const bare = computeRequestHash(geminiBody());
  const withSystem = computeRequestHash(
    geminiBody({ systemInstruction: { parts: [{ text: "You are a coding agent." }] } })
  );

  assert.notEqual(bare, withSystem);
});

test("Gemini tool declarations are part of the fingerprint", () => {
  const bare = computeRequestHash(geminiBody());
  const withTools = computeRequestHash(
    geminiBody({ tools: [{ functionDeclarations: [{ name: "read_file" }] }] })
  );

  assert.notEqual(bare, withTools);
});

test("a Claude system prompt is part of the fingerprint", () => {
  const base = {
    model: "claude/claude-sonnet-4.6",
    messages: [{ role: "user", content: "hihi" }],
    stream: true,
  };

  assert.notEqual(
    computeRequestHash({ ...base, system: "You are terse." }),
    computeRequestHash({ ...base, system: "You are verbose." })
  );
});

test("cosmetic fields still stay out of the fingerprint", () => {
  const base = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
  };
  const noisy = {
    ...base,
    user: "linh",
    metadata: { trace: "abc" },
    stream_options: { include_usage: true },
    request_id: "req-1",
    requestId: "req-2",
  };

  assert.equal(computeRequestHash(base), computeRequestHash(noisy));
});

test("key order does not change the fingerprint", () => {
  const a = { model: "m", stream: true, request: { contents: [1], tools: [] } };
  const b = { request: { tools: [], contents: [1] }, stream: true, model: "m" };

  assert.equal(computeRequestHash(a), computeRequestHash(b));
});

test("a Gemini tool result is treated as a side effect", () => {
  const toolTurn = geminiBody({
    contents: [
      { role: "user", parts: [{ text: "read it" }] },
      { role: "user", parts: [{ functionResponse: { name: "read_file", response: {} } }] },
    ],
  });

  assert.equal(detectSideEffect(toolTurn), true);
  assert.equal(detectSideEffect(geminiBody()), false);
});

/**
 * The other half of the contract: a fingerprint that never matches is not a fix,
 * it is the dedupe feature switched off. The Gemini translator mints
 * `request.sessionId` from Math.random() on every call, so a whole-body hash that
 * kept it would make each request unique and no duplicate would ever be caught.
 */
test("two identical Gemini requests still share a fingerprint across session nonces", () => {
  const first = geminiBody({ sessionId: "-8123456789012345678" });
  const second = geminiBody({ sessionId: "-1987654321098765432" });

  assert.equal(computeRequestHash(first), computeRequestHash(second));
});

test("the CommandCode thread nonce is not part of the fingerprint", () => {
  const base = { model: "commandcode/x", messages: [{ role: "user", content: "hihi" }] };

  assert.equal(
    computeRequestHash({ ...base, threadId: "d1e6a0f0-0000-4000-8000-000000000001" }),
    computeRequestHash({ ...base, threadId: "d1e6a0f0-0000-4000-8000-000000000002" })
  );
});

test("a cosmetic name nested inside a tool schema still counts", () => {
  const withTool = (type) => ({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hihi" }],
    tools: [{ function: { name: "f", parameters: { properties: { user: { type } } } } }],
  });

  assert.notEqual(computeRequestHash(withTool("string")), computeRequestHash(withTool("number")));
});

test("a cosmetic name nested inside a tool result still counts", () => {
  const withHistory = (marker) =>
    geminiBody({
      contents: [
        { role: "user", parts: [{ functionResponse: { response: { metadata: marker } } }] },
        { role: "user", parts: [{ text: "and now?" }] },
      ],
    });

  assert.notEqual(computeRequestHash(withHistory("a")), computeRequestHash(withHistory("b")));
});

test("temperature is read through the Gemini envelope", () => {
  setDedupConfig({ enabled: true, mode: "enforce", maxTemperatureForDedup: 1.0 });
  const hot = { ...geminiBody({ generationConfig: { temperature: 2 } }), stream: false };

  assert.equal(shouldDeduplicate(hot), false);
  assert.equal(shouldDeduplicate({ ...geminiBody(), stream: false }), true);
});

test("streaming requests are excluded from dedupe entirely", () => {
  setDedupConfig({ enabled: true, mode: "enforce", maxTemperatureForDedup: 1.0 });
  assert.equal(shouldDeduplicate(geminiBody()), false);
});
