import test from "node:test";
import assert from "node:assert/strict";

import {
  clearInflight,
  resetDedupCounters,
  setDedupConfig,
  withInflightDedupe,
} from "../../open-sse/services/requestDedup.ts";

function streamingResponse(chunks, delayMs = 5) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function readAll(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

test.beforeEach(() => {
  clearInflight();
  resetDedupCounters();
  setDedupConfig({ enabled: true, mode: "enforce", maxTemperatureForDedup: 1.0 });
});

test("streaming Response: clone() lets two callers read the same SSE body once", async () => {
  let upstreamCalls = 0;
  const fn = async () => {
    upstreamCalls += 1;
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  };

  const body = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    temperature: 0.5,
  };

  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);

  assert.equal(upstreamCalls, 1, "upstream called exactly once");

  const aText = await readAll(a.result);
  const bText = await readAll(b.result);

  assert.equal(aText, bText, "both readers see same payload");
  assert.match(aText, /\[DONE\]/);
  assert.equal(b.wasDeduplicated, true);
});

test("streaming Response: third caller arriving after two readers still gets fresh content", async () => {
  let upstreamCalls = 0;
  const fn = async () => {
    upstreamCalls += 1;
    return streamingResponse([`data: call-${upstreamCalls}\n\n`, "data: [DONE]\n\n"]);
  };

  const body = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
  };

  // first burst — share inflight
  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);
  assert.equal(upstreamCalls, 1);
  const aText = await readAll(a.result);
  const bText = await readAll(b.result);
  assert.equal(aText, bText);
  assert.match(aText, /call-1/);

  // wait past TTL (default 2000ms) — but for the test, lower TTL first
  setDedupConfig({ ttlMs: 30, maxTtlMs: 30 });
  await new Promise((r) => setTimeout(r, 60));

  const c = await withInflightDedupe(body, fn);
  // After TTL, a fresh upstream call should fire.
  assert.equal(upstreamCalls, 2);
  const cText = await readAll(c.result);
  assert.match(cText, /call-2/);
});

test("non-Response result is returned as-is to all sharers", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return { ok: true, n: calls };
  };

  const body = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  };

  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);

  assert.equal(calls, 1);
  assert.deepEqual(a.result, { ok: true, n: 1 });
  assert.deepEqual(b.result, { ok: true, n: 1 });
  // Both readers should see the same object reference (not cloned, since not a Response).
  assert.strictEqual(a.result, b.result);
});

test("combo override: mode=off in combo config disables dedupe even when global is enforce", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return new Response("ok");
  };
  const body = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  };
  const cfgOff = {
    enabled: true,
    mode: "off",
    maxTemperatureForDedup: 1.0,
    ttlMs: 2000,
    maxTtlMs: 5000,
    timeoutMs: 60_000,
  };
  const [a, b] = await Promise.all([
    withInflightDedupe(body, fn, { config: cfgOff }),
    withInflightDedupe(body, fn, { config: cfgOff }),
  ]);
  assert.equal(calls, 2);
  assert.equal(a.wasDeduplicated, false);
  assert.equal(b.wasDeduplicated, false);
});

// Regression for chat-core's execute() shape: { response, url, headers, ... }
// Two callers each need a clone of the nested Response, otherwise the second
// hits "Body has already been read" in chatCorePhaseNonStreamParse.
test("wrapper object containing a Response: each caller gets its own readable Response", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return {
      response: new Response("payload-body", { status: 200 }),
      url: "https://upstream.example/api",
      headers: new Headers({ "x-extra": "1" }),
      transformedBody: { ok: true },
    };
  };

  const body = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    temperature: 0.5,
  };

  const [a, b] = await Promise.all([withInflightDedupe(body, fn), withInflightDedupe(body, fn)]);

  assert.equal(calls, 1, "upstream called exactly once");
  assert.equal(b.wasDeduplicated, true);
  // Both wrappers must have an independently-readable Response.
  const aText = await a.result.response.text();
  const bText = await b.result.response.text();
  assert.equal(aText, "payload-body");
  assert.equal(bText, "payload-body");
  // Other wrapper fields preserved (shared by reference is fine — they are
  // immutable plain values).
  assert.equal(a.result.url, "https://upstream.example/api");
  assert.equal(b.result.url, "https://upstream.example/api");
});
