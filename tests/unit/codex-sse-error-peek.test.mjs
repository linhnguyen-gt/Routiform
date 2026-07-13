import test from "node:test";
import assert from "node:assert/strict";

const { CodexExecutor } = await import("../../open-sse/executors/codex.ts");

function streamFromText(text) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function sseResponse(text, status = 200) {
  return new Response(streamFromText(text), {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

const NORMAL_SSE_TEXT = [
  "event: response.output_text.delta",
  'data: {"type":"response.output_text.delta","delta":"Hello"}',
  "",
  "event: response.output_text.delta",
  'data: {"type":"response.output_text.delta","delta":" world"}',
  "",
  "event: response.completed",
  'data: {"type":"response.completed"}',
  "",
].join("\n");

// ── _peekSseTransientError: the low-level peek helper ──────────────────────

test("_peekSseTransientError: normal stream is byte-identical after the peek (invisible when healthy)", async () => {
  const executor = new CodexExecutor();
  const response = sseResponse(NORMAL_SSE_TEXT);

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, null);
  assert.ok(peek.replacementBody, "expected a replacement stream to be returned");
  const replayedText = await new Response(peek.replacementBody).text();
  assert.equal(replayedText, NORMAL_SSE_TEXT);
});

test("_peekSseTransientError: detects a 200-OK capacity error as account-fallback", async () => {
  const executor = new CodexExecutor();
  const text = [
    "event: error",
    'data: {"error":{"message":"Selected model is at capacity. Please try a different model."}}',
    "",
  ].join("\n");
  const response = sseResponse(text);

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, "account-fallback");
  assert.equal(peek.replacementBody, null);
});

test("_peekSseTransientError: detects server_is_overloaded as a same-account retry", async () => {
  const executor = new CodexExecutor();
  const text = [
    "event: error",
    'data: {"error":{"message":"server_is_overloaded, please retry"}}',
    "",
  ].join("\n");
  const response = sseResponse(text);

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, "retry");
  assert.equal(peek.replacementBody, null);
});

test("_peekSseTransientError: fails open on a non-ok response (never touches the body)", async () => {
  const executor = new CodexExecutor();
  const response = sseResponse("irrelevant", 500);

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, null);
  assert.equal(peek.replacementBody, null);
});

test("_peekSseTransientError: fails open when the body has no readable stream", async () => {
  const executor = new CodexExecutor();
  const response = new Response(null, { status: 204 });

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, null);
  assert.equal(peek.replacementBody, null);
});

test("_peekSseTransientError: fails open (never throws) when the stream errors mid-read", async () => {
  const executor = new CodexExecutor();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: response.output_text.delta\n"));
      },
      pull() {
        throw new Error("simulated upstream socket reset");
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );

  // The peek itself must never throw — that would be a brand-new failure mode.
  const peek = await executor._peekSseTransientError(response);
  assert.equal(peek.matched, null);
});

test("_peekSseTransientError: a hung upstream (no bytes, never closes) does not hang forever", async () => {
  const executor = new CodexExecutor();
  const response = new Response(
    new ReadableStream({
      start() {
        // Never enqueue, never close — simulates a stalled upstream connection.
        // Regression guard for: "no timeout on reader.read() → a hung upstream
        // now hangs inside execute()".
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );

  const startedAt = Date.now();
  const peek = await executor._peekSseTransientError(response);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(peek.matched, null, "fail open on a hung upstream");
  assert.ok(elapsedMs < 4000, `peek took ${elapsedMs}ms — must be bounded, not hang indefinitely`);
});

test("_peekSseTransientError: C3 regression — assistant content containing 'server_is_overloaded' is NOT an error", async () => {
  const executor = new CodexExecutor();
  const text = [
    "event: response.created",
    'data: {"type":"response.created"}',
    "",
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"The error code server_is_overloaded means the upstream is busy."}',
    "",
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":" Selected model is at capacity is another example."}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed"}',
    "",
  ].join("\n");
  const response = sseResponse(text);

  const peek = await executor._peekSseTransientError(response);

  assert.equal(
    peek.matched,
    null,
    "the model explaining these error strings in its own output must never trigger detection"
  );
  assert.ok(peek.replacementBody, "expected a replacement stream to be returned");
  const replayedText = await new Response(peek.replacementBody).text();
  assert.equal(replayedText, text, "content must reach the client byte-identical, untouched");
});

test("_peekSseTransientError: C2 regression — stops scanning at the first content frame, not at `done`", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();

  // Only 2 chunks are ever provided (a preamble, then the first content
  // delta) — the source never enqueues a 3rd chunk and never closes. If the
  // peek tried to read past the content frame (the C2 bug: buffering until
  // `done`), `_peekSseTransientError` would hang waiting on a chunk that
  // never arrives and this test would time out. Resolving promptly proves
  // the peek stopped the instant the content frame was classified.
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.created"}\n\n'));
      controller.enqueue(
        encoder.encode('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n')
      );
      // Intentionally no 3rd chunk, no close().
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const startedAt = Date.now();
  const peek = await executor._peekSseTransientError(response);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(peek.matched, null);
  assert.ok(
    elapsedMs < 500,
    `peek took ${elapsedMs}ms — it must resolve immediately after the content frame, not wait for more chunks`
  );
});

test("_peekSseTransientError: caps the peek at 256 KB and does not hang on an oversized stream", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const chunk = encoder.encode(`data: ${"a".repeat(4096)}\n\n`);
  const totalChunks = Math.ceil((300 * 1024) / chunk.length); // > 256 KB peek cap
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < totalChunks; i++) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );

  const peek = await executor._peekSseTransientError(response);
  assert.equal(peek.matched, null);
  assert.ok(peek.replacementBody);
  const replayed = await new Response(peek.replacementBody).arrayBuffer();
  assert.equal(replayed.byteLength, chunk.length * totalChunks);
});

// ── Content-type gating: /responses/compact answers with plain JSON, not SSE ──

test("_peekSseTransientError: a JSON (non-SSE) response is not read/buffered by the peek", async () => {
  const executor = new CodexExecutor();
  const jsonBody = JSON.stringify({ id: "resp_1", object: "response", output: [] });
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(jsonBody));
      controller.close();
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, null);
  assert.equal(
    peek.replacementBody,
    null,
    "JSON responses must be forwarded untouched, not reassembled"
  );
  assert.equal(
    response.body.locked,
    false,
    "the peek must never call getReader() on a positively-identified non-SSE body"
  );

  // The original body must still be readable in full by the actual caller.
  const text = await response.text();
  assert.equal(text, jsonBody);
});

test("_peekSseTransientError: a Codex SSE response with NO content-type header is still peeked (regression guard)", async () => {
  const executor = new CodexExecutor();
  const text = [
    "event: error",
    'data: {"error":{"message":"server_is_overloaded, please retry"}}',
    "",
  ].join("\n");
  // No headers at all — a real Codex SSE response has been observed to arrive
  // this way in production; a strict content-type check previously 502'd it.
  const response = new Response(streamFromText(text), { status: 200 });

  const peek = await executor._peekSseTransientError(response);

  assert.equal(peek.matched, "retry", "missing content-type must never skip the peek");
});

// ── execute(): full round trip through the retry / account-fallback logic ──

function withMockedFetch(impl, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function baseExecuteInput(overrides = {}) {
  return {
    model: "gpt-5.3-codex",
    body: { model: "gpt-5.3-codex", input: [{ role: "user", content: "hi" }] },
    stream: true,
    credentials: { accessToken: "test-token" },
    log: { debug: () => {}, warn: () => {}, info: () => {}, error: () => {} },
    ...overrides,
  };
}

test("execute(): a normal Codex SSE stream is byte-identical end-to-end (peek invisible)", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;

  await withMockedFetch(
    async () => {
      fetchCalls++;
      return sseResponse(NORMAL_SSE_TEXT);
    },
    async () => {
      const result = await executor.execute(baseExecuteInput());
      assert.equal(fetchCalls, 1);
      const text = await result.response.text();
      assert.equal(text, NORMAL_SSE_TEXT);
    }
  );
});

test("execute(): converts a 200-OK capacity error into 503 to trigger account rotation", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;

  await withMockedFetch(
    async () => {
      fetchCalls++;
      return sseResponse(
        'data: {"error":{"message":"Selected model is at capacity. Please try a different model."}}\n\n'
      );
    },
    async () => {
      const result = await executor.execute(baseExecuteInput());
      // Account-fallback must not retry on the same account — a single fetch call.
      assert.equal(fetchCalls, 1);
      assert.equal(result.response.status, 503);
      const body = await result.response.json();
      assert.equal(body.error.code, "service_unavailable");
      assert.match(body.error.message, /at capacity/i);
    }
  );
});

test("execute(): retries server_is_overloaded on the SAME account and returns the recovered stream", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;

  await withMockedFetch(
    async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        return sseResponse('data: {"error":{"message":"server_is_overloaded"}}\n\n');
      }
      return sseResponse(NORMAL_SSE_TEXT);
    },
    async () => {
      const result = await executor.execute(baseExecuteInput());
      assert.equal(fetchCalls, 2, "expected exactly one same-account retry");
      assert.equal(result.response.status, 200);
      const text = await result.response.text();
      assert.equal(text, NORMAL_SSE_TEXT);
    }
  );
});

test("execute(): a same-account overloaded retry sends a byte-identical body on attempt 2 (native passthrough)", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;
  const sentBodies = [];

  const input = baseExecuteInput({
    body: {
      model: "gpt-5.3-codex",
      _nativeCodexPassthrough: true,
      previous_response_id: "resp_abc123",
      input: [{ role: "user", content: "continue" }],
    },
  });

  await withMockedFetch(
    async (_url, opts) => {
      fetchCalls++;
      sentBodies.push(opts.body);
      if (fetchCalls === 1) {
        return sseResponse('data: {"error":{"message":"server_is_overloaded"}}\n\n');
      }
      return sseResponse(NORMAL_SSE_TEXT);
    },
    async () => {
      const result = await executor.execute(input);
      assert.equal(fetchCalls, 2, "expected exactly one same-account retry");
      assert.equal(result.response.status, 200);
      assert.equal(sentBodies.length, 2);
      assert.equal(
        sentBodies[0],
        sentBodies[1],
        "attempt 2 must send the exact same request body as attempt 1 (no shape drift across retries)"
      );
      // Specifically guard the regression: previous_response_id must survive
      // on the retry, and the passthrough marker must not leak the request
      // down the translated (non-passthrough) shaping path on attempt 2.
      const secondBody = JSON.parse(sentBodies[1]);
      assert.equal(secondBody.previous_response_id, "resp_abc123");
      assert.equal(secondBody._nativeCodexPassthrough, undefined);
      assert.equal(
        secondBody.prompt_cache_key,
        undefined,
        "must not take the translated-path shaping"
      );
    }
  );
});

test("execute(): exhausts retries on persistent server_is_overloaded and surfaces 503", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;

  await withMockedFetch(
    async () => {
      fetchCalls++;
      return sseResponse('data: {"error":{"message":"server_is_overloaded"}}\n\n');
    },
    async () => {
      const result = await executor.execute(baseExecuteInput());
      // 1 initial attempt + CODEX_SSE_RETRY_MAX_ATTEMPTS(2) retries = 3 fetch calls.
      assert.equal(fetchCalls, 3);
      assert.equal(result.response.status, 503);
      const body = await result.response.json();
      assert.equal(body.error.code, "service_unavailable");
    }
  );
});

test("execute(): C3 regression — assistant text mentioning 'server_is_overloaded' triggers no retry and no 503", async () => {
  const executor = new CodexExecutor();
  let fetchCalls = 0;
  const text =
    'data: {"type":"response.output_text.delta","delta":"server_is_overloaded is a transient upstream limit."}\n\n';

  await withMockedFetch(
    async () => {
      fetchCalls++;
      return sseResponse(text);
    },
    async () => {
      const result = await executor.execute(baseExecuteInput());
      assert.equal(fetchCalls, 1, "model content must never trigger the same-account retry path");
      assert.equal(result.response.status, 200);
      const body = await result.response.text();
      assert.equal(body, text, "content must reach the client untouched");
    }
  );
});

// ── Timing: proves the peek does not buffer the response to completion ─────

test("execute(): resolves long before a slow-streaming upstream finishes generating (C2 regression)", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const CHUNK_DELAY_MS = 100;
  const TOTAL_DELTA_CHUNKS = 10;

  let streamFullyDrainedAt = null;
  const streamStartedAt = Date.now();

  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.created"}\n\n'));
      for (let i = 0; i < TOTAL_DELTA_CHUNKS; i++) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
        controller.enqueue(
          encoder.encode(`data: {"type":"response.output_text.delta","delta":"chunk-${i}"}\n\n`)
        );
      }
      streamFullyDrainedAt = Date.now();
      controller.close();
    },
  });

  await withMockedFetch(
    async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    async () => {
      const result = await executor.execute(baseExecuteInput());
      const executeResolvedAfterMs = Date.now() - streamStartedAt;

      // The full generation takes ~ CHUNK_DELAY_MS * TOTAL_DELTA_CHUNKS (~1000ms).
      // A peek that buffers to completion (the C2 bug) would take that long;
      // a true peek stops at the second frame (response.created, then the
      // first content delta) and must resolve in roughly one chunk interval.
      assert.ok(
        executeResolvedAfterMs < CHUNK_DELAY_MS * (TOTAL_DELTA_CHUNKS / 2),
        `execute() resolved after ${executeResolvedAfterMs}ms — the peek is buffering the full ` +
          `stream instead of stopping at the first content frame (TTFT regression)`
      );

      // First chunk (headers/response object) must be available well before
      // the upstream has finished emitting every delta.
      assert.equal(
        streamFullyDrainedAt,
        null,
        "execute() must resolve before generation completes"
      );

      // The stream must still deliver every chunk once actually consumed.
      const text = await result.response.text();
      assert.ok(text.includes("chunk-0") && text.includes(`chunk-${TOTAL_DELTA_CHUNKS - 1}`));
    }
  );
});

// ── Regression: the peek's read timeout must NEVER drop bytes of a healthy
// stream, no matter how long the upstream sits silent before its first
// content frame. `CODEX_SSE_PEEK_READ_TIMEOUT_MS` is 3000ms; Codex reasoning
// models routinely sit silent between `response.in_progress` and the first
// output item at high/xhigh effort, well past that bound. An earlier version
// of this peek called `reader.cancel()` on timeout, which tore down the live
// upstream connection and silently truncated the response to whatever had
// already been buffered — HTTP 200, no error, no failover, empty/partial
// content. These tests assert on the exact byte count delivered to the
// client, not merely "no error thrown", since a truncated-but-error-free
// response is precisely the failure mode being guarded against.

test("_peekSseTransientError: a >3s silent gap before the first content frame delivers EVERY byte (no truncation)", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const SILENT_GAP_MS = 3300; // > CODEX_SSE_PEEK_READ_TIMEOUT_MS (3000ms)

  // Each frame ends with its own blank-line separator ("\n\n") so chunks can
  // be concatenated directly without losing a separator at the chunk
  // boundary — this is what makes `fullText` below byte-for-byte identical
  // to what actually gets enqueued.
  const preambleFrame1 = 'event: response.created\ndata: {"type":"response.created"}\n\n';
  const preambleFrame2 = 'event: response.in_progress\ndata: {"type":"response.in_progress"}\n\n';
  const contentFrames =
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"The answer is 42."}\n\n' +
    'event: response.completed\ndata: {"type":"response.completed"}\n\n';
  const fullText = preambleFrame1 + preambleFrame2 + contentFrames;
  const expectedBytes = encoder.encode(fullText).length;

  const body = new ReadableStream({
    async start(controller) {
      // Preamble arrives immediately...
      controller.enqueue(encoder.encode(preambleFrame1));
      controller.enqueue(encoder.encode(preambleFrame2));
      // ...then the model "thinks" silently for longer than the peek's read
      // timeout before its first content frame arrives.
      await new Promise((resolve) => setTimeout(resolve, SILENT_GAP_MS));
      controller.enqueue(encoder.encode(contentFrames));
      controller.close();
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const peek = await executor._peekSseTransientError(response);
  assert.equal(
    peek.matched,
    null,
    "a slow-but-healthy stream must never be classified as an error"
  );
  assert.ok(peek.replacementBody, "expected a replacement stream to forward the live upstream");

  const deliveredBytes = await new Response(peek.replacementBody).arrayBuffer();
  assert.equal(
    deliveredBytes.byteLength,
    expectedBytes,
    `expected all ${expectedBytes} bytes to reach the client, got ${deliveredBytes.byteLength}`
  );
  const deliveredText = Buffer.from(deliveredBytes).toString("utf8");
  assert.equal(deliveredText, fullText, "delivered content must be byte-identical to the source");
});

test("execute(): a >3s silent gap before the first content frame still delivers full content end-to-end", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const SILENT_GAP_MS = 3300;

  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          ["event: response.created", 'data: {"type":"response.created"}', ""].join("\n")
        )
      );
      await new Promise((resolve) => setTimeout(resolve, SILENT_GAP_MS));
      controller.enqueue(encoder.encode(NORMAL_SSE_TEXT));
      controller.close();
    },
  });

  await withMockedFetch(
    async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    async () => {
      const result = await executor.execute(baseExecuteInput());
      assert.equal(result.response.status, 200);
      const deliveredBytes = await result.response.arrayBuffer();
      const expectedText =
        ["event: response.created", 'data: {"type":"response.created"}', ""].join("\n") +
        NORMAL_SSE_TEXT;
      const expectedBytes = encoder.encode(expectedText).length;
      assert.equal(
        deliveredBytes.byteLength,
        expectedBytes,
        `expected ${expectedBytes} bytes, got ${deliveredBytes.byteLength} — the answer must not be silently dropped`
      );
      assert.equal(Buffer.from(deliveredBytes).toString("utf8"), expectedText);
    }
  );
});

test("_peekSseTransientError: first byte arriving after >3s still delivers full content (empty-200 regression)", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const FIRST_BYTE_DELAY_MS = 3300; // > CODEX_SSE_PEEK_READ_TIMEOUT_MS (3000ms)
  const expectedBytes = encoder.encode(NORMAL_SSE_TEXT).length;

  const body = new ReadableStream({
    async start(controller) {
      // Nothing at all arrives for longer than the peek's read timeout —
      // the very first upstream read is the one that times out.
      await new Promise((resolve) => setTimeout(resolve, FIRST_BYTE_DELAY_MS));
      controller.enqueue(encoder.encode(NORMAL_SSE_TEXT));
      controller.close();
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const peek = await executor._peekSseTransientError(response);
  assert.equal(peek.matched, null);
  assert.ok(peek.replacementBody);

  const deliveredBytes = await new Response(peek.replacementBody).arrayBuffer();
  assert.equal(
    deliveredBytes.byteLength,
    expectedBytes,
    `expected ${expectedBytes} bytes, got ${deliveredBytes.byteLength} — must not be an empty 200`
  );
  assert.notEqual(deliveredBytes.byteLength, 0, "must not deliver an empty response");
  assert.equal(Buffer.from(deliveredBytes).toString("utf8"), NORMAL_SSE_TEXT);
});

// ── Regression: the replacement stream must apply real backpressure ────────
// An earlier version drained the entire upstream body inside the
// ReadableStream's `start()` callback, which the spec invokes eagerly at
// construction time regardless of whether the consumer is reading. That
// buffered a whole multi-MB Codex SSE body into memory per slow/paused
// client. The fix moves the drain loop into `pull()`, which the stream only
// invokes once its internal queue has room again (desiredSize > 0) — i.e.
// once the consumer has actually taken a previous chunk. This test drives
// the consumer manually, one read at a time, and asserts the number of
// upstream `reader.read()` calls tracks the number of consumer reads
// instead of racing ahead to drain everything immediately.

test("_peekSseTransientError: replacement stream applies backpressure — pull() reads track consumer demand, not eager drain", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const TOTAL_UPSTREAM_CHUNKS = 20;

  let upstreamReadCount = 0;
  let upstreamFullyDrained = false;

  // highWaterMark: 0 makes this source strictly demand-driven — pull() only
  // fires in direct response to an outstanding reader.read() request, with
  // no read-ahead prefetch of its own. That isolates the assertions below to
  // the behavior of the replacement stream's own pull()-per-read design
  // instead of also picking up this test double's independent buffering.
  const body = new ReadableStream(
    {
      pull(controller) {
        upstreamReadCount++;
        if (upstreamReadCount > TOTAL_UPSTREAM_CHUNKS) {
          upstreamFullyDrained = true;
          controller.close();
          return;
        }
        // Every frame carries a content event so the peek's classify() loop
        // stops scanning after the first chunk (matched === null) and hands
        // off the rest to the replacement stream.
        const payload = `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"chunk-${upstreamReadCount - 1}"}\n\n`;
        controller.enqueue(encoder.encode(payload));
      },
    },
    { highWaterMark: 0 }
  );
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const peek = await executor._peekSseTransientError(response);
  assert.equal(peek.matched, null);
  assert.ok(peek.replacementBody, "expected a replacement stream");

  // The peek's own classify loop already consumed exactly 1 upstream chunk
  // (the first content frame) before returning control here.
  const readsConsumedByPeek = upstreamReadCount;
  assert.equal(readsConsumedByPeek, 1, "peek should stop at the first content frame");

  const consumerReader = peek.replacementBody.getReader();

  // Pull N times, one at a time, and assert upstream reads never race ahead
  // of consumer demand. desiredSize on a default-strategy stream (HWM=1)
  // stays <= 0 while a chunk sits unread in the queue, so pull() is not
  // invoked again until this loop's own .read() drains it.
  const PULLS_TO_CHECK = 5;
  for (let i = 0; i < PULLS_TO_CHECK; i++) {
    const before = upstreamReadCount;
    const { done } = await consumerReader.read();
    assert.equal(done, false, `unexpected early end at pull ${i}`);
    const after = upstreamReadCount;
    // Each single consumer read must trigger at most one new upstream read
    // (pull() awaits exactly one reader.read()) — never a full drain.
    assert.ok(
      after - before <= 1,
      `pull ${i}: upstream read count jumped from ${before} to ${after} — pull() is draining more than one chunk per consumer read`
    );
  }

  assert.ok(
    upstreamReadCount <= readsConsumedByPeek + PULLS_TO_CHECK,
    `after ${PULLS_TO_CHECK} consumer reads, upstream was read ${upstreamReadCount} times ` +
      `(peek consumed ${readsConsumedByPeek}) — expected roughly 1:1, not a full eager drain`
  );
  assert.ok(
    !upstreamFullyDrained,
    "the entire upstream body must NOT be drained into memory before the slow consumer catches up"
  );
  assert.ok(
    upstreamReadCount < TOTAL_UPSTREAM_CHUNKS,
    "upstream reads must lag behind the total chunk count while the consumer is still reading slowly"
  );

  // Cleanup: drain the rest so the test doesn't leave a dangling stream.
  await consumerReader.cancel("test cleanup");
});

test("execute(): first byte arriving after >3s still delivers full content end-to-end (empty-200 regression)", async () => {
  const executor = new CodexExecutor();
  const encoder = new TextEncoder();
  const FIRST_BYTE_DELAY_MS = 3300;
  const expectedBytes = encoder.encode(NORMAL_SSE_TEXT).length;

  const body = new ReadableStream({
    async start(controller) {
      await new Promise((resolve) => setTimeout(resolve, FIRST_BYTE_DELAY_MS));
      controller.enqueue(encoder.encode(NORMAL_SSE_TEXT));
      controller.close();
    },
  });

  await withMockedFetch(
    async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    async () => {
      const result = await executor.execute(baseExecuteInput());
      assert.equal(result.response.status, 200);
      const deliveredBytes = await result.response.arrayBuffer();
      assert.equal(
        deliveredBytes.byteLength,
        expectedBytes,
        `expected ${expectedBytes} bytes, got ${deliveredBytes.byteLength} bytes delivered — client must not see an empty 200`
      );
      assert.equal(Buffer.from(deliveredBytes).toString("utf8"), NORMAL_SSE_TEXT);
    }
  );
});
