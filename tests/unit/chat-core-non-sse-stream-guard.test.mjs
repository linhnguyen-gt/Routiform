import test from "node:test";
import assert from "node:assert/strict";

const { chatCorePhaseStreamingResponse } =
  await import("../../open-sse/handlers/chat-core/chat-core-phase-streaming.ts");

function buildPipeline(providerResponse, overrides = {}) {
  return {
    log: { debug: () => {} },
    provider: "codex",
    model: "gpt-5.3-codex",
    startTime: Date.now(),
    providerResponse,
    streamController: {
      signal: new AbortController().signal,
      handleError: () => {},
    },
    ...overrides,
  };
}

test("chatCorePhaseStreamingResponse: text/html upstream body returns a clean JSON error, no pipe crash", async () => {
  const html = "<html><head><title>502 Bad Gateway</title></head><body>cloudflare</body></html>";
  const providerResponse = new Response(html, {
    status: 502,
    headers: { "content-type": "text/html; charset=UTF-8" },
  });

  let handledError = null;
  const p = buildPipeline(providerResponse, {
    streamController: {
      signal: new AbortController().signal,
      handleError: (err) => {
        handledError = err;
      },
    },
  });

  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
  process.on("unhandledRejection", onUnhandledRejection);

  let result;
  try {
    result = await chatCorePhaseStreamingResponse(p);
    // Give any stray microtasks a chance to surface as unhandled rejections.
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }

  assert.equal(unhandledRejections.length, 0, "no unhandled rejection should occur");
  assert.equal(result.success, false);
  assert.equal(result.status, 502);
  assert.match(result.error, /502 Bad Gateway/);
  assert.ok(handledError instanceof Error);

  assert.equal(result.response.status, 502);
  assert.equal(result.response.headers.get("content-type"), "application/json");
  const body = await result.response.json();
  assert.match(body.error.message, /502 Bad Gateway/);
});

test("chatCorePhaseStreamingResponse: strips HTML tags and clamps a title-less body", async () => {
  const html = `<html><body>${"x".repeat(500)}</body></html>`;
  const providerResponse = new Response(html, {
    status: 403,
    headers: { "content-type": "text/html" },
  });

  const p = buildPipeline(providerResponse);
  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, false);
  assert.equal(result.status, 403);
  // Falls back to a generic message when the body has no <title> and is too long to embed.
  assert.match(result.error, /Upstream returned non-SSE response/);
});

test("chatCorePhaseStreamingResponse: application/json content-type is not treated as an error", async () => {
  const providerResponse = new Response('{"ok":true}', {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const p = buildPipeline(providerResponse, {
    body: {},
    translatedBody: {},
    toolNameMap: undefined,
    connectionId: "conn_1",
    apiKeyInfo: null,
    persistAttemptLogs: () => {},
    reqLogger: {},
  });

  const result = await chatCorePhaseStreamingResponse(p);

  // Should proceed past the guard into the normal passthrough streaming path.
  assert.equal(result.success, true);
  assert.ok(result.response instanceof Response);
});

// Reversal note: an earlier revision of this guard allowed `text/plain` on
// the theory that some SSE bodies might legitimately use it. That was wrong
// — `text/plain` is also the single most common content-type for WAF/proxy
// interstitial pages, so allowing it re-opened the exact hole this guard
// exists to close (empty 200, no failover), just with a different
// content-type. `text/plain` must be hard-rejected like any other
// unrecognized content-type unless a specific real provider is found to
// need it (in which case allowlist that provider, not the content-type).
test("chatCorePhaseStreamingResponse: text/plain content-type IS hard-rejected (WAF interstitials commonly use it)", async () => {
  const providerResponse = new Response("rate limited, try again later", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

  const p = buildPipeline(providerResponse, {
    body: {},
    translatedBody: {},
    toolNameMap: undefined,
    connectionId: "conn_1",
    apiKeyInfo: null,
    persistAttemptLogs: () => {},
    reqLogger: {},
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, false, "text/plain must not bypass the non-SSE guard");
  assert.equal(result.status, 502);
});

test("chatCorePhaseStreamingResponse: missing content-type fails OPEN — Codex streams SSE without one", async () => {
  const providerResponse = new Response(new ReadableStream({ start: (c) => c.close() }));
  // Response() sets no content-type for a ReadableStream body. Codex answers a
  // real streaming request with no content-type header at all, so rejecting
  // "no header" 502s a perfectly healthy provider. Absence of a header is not
  // evidence of a bad body — only a present-and-wrong header is.
  assert.equal(providerResponse.headers.get("content-type"), null);

  const p = buildPipeline(providerResponse, {
    body: {},
    translatedBody: {},
    toolNameMap: undefined,
    connectionId: "conn_1",
    apiKeyInfo: null,
    persistAttemptLogs: () => {},
    reqLogger: {},
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, true, "a missing content-type must pass the guard, not 502");
});

test("chatCorePhaseStreamingResponse: application/x-ndjson content-type is not hard-rejected", async () => {
  const providerResponse = new Response(new ReadableStream({ start: (c) => c.close() }), {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });

  const p = buildPipeline(providerResponse, {
    body: {},
    translatedBody: {},
    toolNameMap: undefined,
    connectionId: "conn_1",
    apiKeyInfo: null,
    persistAttemptLogs: () => {},
    reqLogger: {},
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, true, "ndjson streams must not be hard-rejected");
});

// ── H1 regression: a 200-OK non-SSE body must produce a status that makes
// downstream `markAccountUnavailable(...).shouldFallback` true. By the time
// this phase runs, chatCorePhaseUpstreamErrors has already filtered out every
// non-2xx response, so providerResponse.status is guaranteed 2xx here — the
// guard must never forward that 2xx status verbatim (that was the bug: SDKs
// parse an HTTP 200 with an `{"error":...}` body as a successful completion,
// and failover never triggers).

test("chatCorePhaseStreamingResponse: H1 — a 200-OK non-SSE body returns 502, not 200, so shouldFallback can trigger", async () => {
  const html =
    "<html><head><title>Just a moment...</title></head><body>captcha challenge</body></html>";
  const providerResponse = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=UTF-8" },
  });

  const p = buildPipeline(providerResponse, {
    streamController: {
      signal: new AbortController().signal,
      handleError: () => {},
    },
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, false);
  assert.notEqual(
    result.status,
    200,
    "must never surface HTTP 200 for a rejected non-SSE body — SDKs treat 200 as a completion"
  );
  assert.equal(result.status, 502);
  assert.equal(result.response.status, 502);
});

test("chatCorePhaseStreamingResponse: onRequestSuccess is NOT called when the non-SSE guard rejects the response", async () => {
  const html = "<html><head><title>Blocked</title></head><body>waf</body></html>";
  const providerResponse = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });

  let onRequestSuccessCalled = false;
  const p = buildPipeline(providerResponse, {
    streamController: {
      signal: new AbortController().signal,
      handleError: () => {},
    },
    onRequestSuccess: async () => {
      onRequestSuccessCalled = true;
    },
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, false);
  assert.equal(
    onRequestSuccessCalled,
    false,
    "an account serving a rejected non-SSE body must not be marked healthy"
  );
});

test("chatCorePhaseStreamingResponse: onRequestSuccess IS called once a legitimate SSE stream passes the guard", async () => {
  const providerResponse = new Response(new ReadableStream({ start: (c) => c.close() }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  let onRequestSuccessCalled = false;
  const p = buildPipeline(providerResponse, {
    body: {},
    translatedBody: {},
    toolNameMap: undefined,
    connectionId: "conn_1",
    apiKeyInfo: null,
    persistAttemptLogs: () => {},
    reqLogger: {},
    onRequestSuccess: async () => {
      onRequestSuccessCalled = true;
    },
  });

  const result = await chatCorePhaseStreamingResponse(p);

  assert.equal(result.success, true);
  assert.equal(onRequestSuccessCalled, true);
});
