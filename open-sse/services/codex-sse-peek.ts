// Codex SSE 200-OK error peek + byte-identical stream reassembly.
//
// Extracted verbatim from executors/codex.ts. Every comment below documents a
// load-bearing lifecycle invariant of the reader/stream handling — read them
// before changing anything here:
//   - the peek NEVER cancels the reader on timeout (cancelling truncates a
//     slow-but-healthy stream silently),
//   - at most ONE reader.read() is ever in flight,
//   - the read abandoned by a peek timeout is consumed exactly once, before
//     any new read,
//   - the replacement stream reuses the SAME reader (no releaseLock/reacquire),
//   - the upstream drain lives in pull() (not start()) so backpressure holds.

import { scanCodexSseFrame, type CodexSseFrameClassification } from "./codex-sse-scan.ts";

// Outer safety-net ceiling only — legitimate streams never get close to this;
// the peek stops as soon as the first non-error SSE frame is classified (see
// scanCodexSseFrame), which for a healthy stream happens on the very first
// `reader.read()`. This cap exists purely so an unparseable/garbage stream
// can't be scanned forever.
const CODEX_SSE_PEEK_BYTES = 256 * 1024; // 256 KB
// Defense-in-depth: bound the number of SSE frames inspected regardless of
// their byte size (protects against many tiny chunks).
const CODEX_SSE_PEEK_MAX_FRAMES = 32;
// Bound a single upstream `reader.read()` call during the peek. A real error
// or the first content frame arrives essentially immediately at the start of
// the stream — if a read takes this long, treat it as fail-open rather than
// hanging execute() indefinitely.
const CODEX_SSE_PEEK_READ_TIMEOUT_MS = 3000;

export type CodexSsePeekResult = {
  matched: "retry" | "account-fallback" | null;
  replacementBody: ReadableStream<Uint8Array> | null;
};

const PEEK_READ_TIMEOUT = Symbol("codex-sse-peek-read-timeout");

// Each branch carries the other's field as `?: undefined`. The project's base
// tsconfig runs with `strict: false` (so `strictNullChecks` is off), and
// without strictNullChecks TypeScript does not narrow a discriminated union
// through `if (race.timedOut) { ... break; }` — `race.result` below would be
// a TS2339. Declaring both fields on both branches keeps the union
// exhaustive at every construction site while staying readable under either
// strictness setting.
type PeekReadRace =
  | {
      timedOut: false;
      result: ReadableStreamReadResult<Uint8Array>;
      pendingRead?: undefined;
    }
  | {
      timedOut: true;
      pendingRead: Promise<ReadableStreamReadResult<Uint8Array>>;
      result?: undefined;
    };

/**
 * Race a single reader.read() against a bound WITHOUT cancelling the reader
 * on timeout. Cancelling would tear down the live upstream connection —
 * `reader.read()` has no way to "come back" once cancelled, so a slow-but-
 * healthy stream (e.g. a Codex reasoning model sitting silent between
 * `response.in_progress` and its first output item) would be truncated with
 * no error and no failover. On timeout this returns the still-in-flight read
 * promise instead of touching the reader — the caller folds its eventual
 * result into the stream it hands to the client. A slow stream stays slow;
 * it never loses bytes.
 */
async function raceReadOrTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<PeekReadRace> {
  const pendingRead = reader.read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutMarker = new Promise<typeof PEEK_READ_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(PEEK_READ_TIMEOUT), timeoutMs);
  });
  try {
    const raced = await Promise.race([pendingRead, timeoutMarker]);
    if (raced === PEEK_READ_TIMEOUT) {
      // pendingRead is still in flight. Attach a no-op rejection handler so
      // Node doesn't report an "unhandled rejection" in the window before
      // the replacement stream below actually awaits it.
      pendingRead.catch(() => {});
      return { timedOut: true, pendingRead };
    }
    return { timedOut: false, result: raced as ReadableStreamReadResult<Uint8Array> };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Peek the START of an SSE body — bounded by CODEX_SSE_PEEK_BYTES /
 * CODEX_SSE_PEEK_MAX_FRAMES / CODEX_SSE_PEEK_READ_TIMEOUT_MS, whichever
 * comes first — to detect the transient error patterns **before** any real
 * content has streamed. Detection is scoped to complete SSE frames whose
 * event type is `error` / `response.failed` / `response.incomplete` (see
 * scanCodexSseFrame + extractCodexSseErrorText); the moment any other event
 * type is seen (i.e. generation has actually started — response.output_text.
 * delta, tool calls, etc.) the peek stops immediately so the caller can start
 * forwarding bytes to the client without waiting for the rest of the
 * generation. This is what keeps a healthy stream from being buffered: for a
 * normal Codex response the loop below runs at most one or two
 * `reader.read()` iterations, not until `done`.
 *
 * CODEX_SSE_PEEK_READ_TIMEOUT_MS bounds only *how long this function keeps
 * scanning for an error signature* — it never cancels the underlying
 * upstream connection. Codex reasoning models routinely sit silent for
 * several seconds between `response.in_progress` and their first output
 * item at high/xhigh effort, and cancelling on that silence would truncate
 * a perfectly healthy response with no error and no failover. On timeout
 * this stops classifying frames (identical to "nothing matched") and hands
 * the still-in-flight read + the live reader to the replacement stream
 * below, so a slow stream simply stays slow instead of losing bytes.
 *
 * Reassembles a byte-identical replacement stream (peeked prefix +
 * remaining upstream body, read via the SAME reader instance — never a
 * freshly reacquired one) when nothing matched, so a healthy stream is
 * never altered by having been peeked, no matter how the peek loop exited.
 *
 * Fail-open by construction: a non-ok/bodyless response, a size overrun, or
 * a read/decode error all leave `matched` as `null`, so the caller falls
 * through and reassembles the original bytes untouched. The peek must never
 * become a new failure mode.
 *
 * Skips entirely (fail-open, body left completely untouched — never even
 * getReader()'d) when the response's Content-Type POSITIVELY identifies it as
 * non-SSE (e.g. `application/json`, as `/responses/compact` can answer with
 * once `stream` is stripped from the request). This is a plain-JSON body with
 * no `data:`/`\n\n` frame boundaries, so the scan loop would otherwise never
 * classify a frame and would buffer the entire body up to the 256 KB cap for
 * no reason.
 *
 * IMPORTANT: this must only skip on a POSITIVE non-SSE match, never on a
 * missing/absent Content-Type — real Codex SSE responses have arrived with no
 * Content-Type header at all in production, and treating "missing" as "not
 * SSE" previously caused a strict content-type check to 502 healthy Codex
 * traffic. Missing or `text/event-stream` (or anything else) still gets
 * peeked as before.
 */
function isPositivelyNonSseContentType(response: Response): boolean {
  const contentType = response.headers?.get?.("content-type");
  return typeof contentType === "string" && /application\/json/i.test(contentType);
}

export async function peekCodexSseTransientError(response: Response): Promise<CodexSsePeekResult> {
  if (!response?.ok || !response.body || isPositivelyNonSseContentType(response)) {
    return { matched: null, replacementBody: null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let text = "";
  let processedUpTo = 0;
  let framesSeen = 0;
  let matched: CodexSsePeekResult["matched"] = null;
  let stopPeeking = false;
  // Set only when a read() timed out mid-flight (see raceReadOrTimeout):
  // the read is still running against the live upstream connection and
  // must be resolved — never dropped — before the replacement stream
  // continues reading normally.
  let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  const classify = (classification: CodexSseFrameClassification): boolean => {
    framesSeen++;
    if (classification === "error-fallback") {
      matched = "account-fallback";
      return true;
    }
    if (classification === "error-retry") {
      matched = "retry";
      return true;
    }
    // "content" (real generation started) or "error-unmatched" (a terminal
    // error frame with no recognized signature): either way, stop peeking
    // — no more error signal can meaningfully arrive before the stream
    // moves on, and we must not buffer past the first real event.
    if (classification === "content" || classification === "error-unmatched") {
      return true;
    }
    // "preamble" or null (unparseable/unrecognized) — keep scanning.
    return framesSeen >= CODEX_SSE_PEEK_MAX_FRAMES;
  };

  try {
    while (!stopPeeking && text.length < CODEX_SSE_PEEK_BYTES) {
      const race = await raceReadOrTimeout(reader, CODEX_SSE_PEEK_READ_TIMEOUT_MS);
      if (race.timedOut) {
        // Abandon peeking, not the stream: the read keeps running against
        // the live upstream connection. Nothing has matched by
        // definition — no bytes have been inspected past what's already
        // in `chunks`, and none will be lost, because the replacement
        // stream below resolves `pendingRead` before doing anything else.
        pendingRead = race.pendingRead;
        break;
      }

      const { done, value } = race.result;
      if (value) {
        chunks.push(value);
        text += decoder.decode(value, { stream: true });
      }

      let boundary: number;
      while (!stopPeeking && (boundary = text.indexOf("\n\n", processedUpTo)) !== -1) {
        const frame = text.slice(processedUpTo, boundary);
        processedUpTo = boundary + 2;
        stopPeeking = classify(scanCodexSseFrame(frame));
      }

      if (done) {
        // Flush a trailing frame that never got a closing blank line
        // (the stream ended right after it) so a single-frame error
        // response is still detected.
        if (!stopPeeking) {
          const tail = text.slice(processedUpTo).trim();
          if (tail) {
            classify(scanCodexSseFrame(tail));
          }
        }
        break;
      }
    }
  } catch {
    // Fail open: a genuine read/decode error (NOT a timeout — timeouts no
    // longer throw, see raceReadOrTimeout) is treated as "nothing
    // matched" so the caller passes through whatever was captured. The
    // reader itself is left untouched; the replacement stream below will
    // surface the same error to the client on its next read instead of
    // silently truncating.
    matched = null;
  }

  if (matched) {
    // A real error signature was found in a *complete* frame the peek
    // already finished decoding — safe to cancel: nothing beyond what was
    // classified is being discarded, and this path always returns a
    // synthesized error response instead of the body.
    try {
      await reader.cancel("codex-sse-peek-error-match");
    } catch {
      // noop — upstream connection is being discarded anyway
    }
    return { matched, replacementBody: null };
  }

  // Nothing matched (including an abandoned/errored peek): reassemble
  // prefix + remaining upstream bytes using the SAME reader instance the
  // peek already holds the lock on. Reusing it (instead of releasing and
  // calling response.body.getReader() again) is what makes this safe even
  // when a read is still in flight — there is no release/reacquire window
  // in which bytes could be missed or the lock could be contended.
  const replacementBody = new ReadableStream<Uint8Array>({
    start(controller) {
      // The peeked prefix is already bounded by CODEX_SSE_PEEK_BYTES, so
      // enqueuing it eagerly here cannot reintroduce unbounded buffering —
      // it's the UNBOUNDED remainder of the upstream body that must be
      // gated on consumer demand, which is why that part happens in pull()
      // below instead of here.
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    // One upstream reader.read() per pull(). The stream's default queuing
    // strategy only invokes pull() once its internal queue has room again
    // (desiredSize > 0) — i.e. once the consumer has actually drained a
    // previously enqueued chunk. Tying each upstream read to that signal
    // is what restores real backpressure to the live Codex socket for a
    // slow/paused client, instead of pumping the whole body into memory
    // synchronously the moment the stream is constructed (which is what
    // draining in start() did).
    async pull(controller) {
      try {
        if (pendingRead) {
          // Resolve the read abandoned by the peek's timeout exactly once,
          // before any new reader.read() — see raceReadOrTimeout. This is
          // the single in-flight read left over from the peek; it must be
          // consumed here first so it's never dropped and never raced
          // against a second concurrent read on the same reader.
          const pending = pendingRead;
          pendingRead = null;
          const { done, value } = await pending;
          if (value) controller.enqueue(value);
          if (done) controller.close();
          return;
        }
        const { done, value } = await reader.read();
        if (value) controller.enqueue(value);
        if (done) controller.close();
      } catch (err) {
        // A client cancel mid-pull closes the controller, so enqueue/close
        // above throw — and controller.error() on an already-closed
        // controller throws too, rejecting this pull() promise. Swallow that
        // second throw: the stream is already terminated, there is nothing
        // left to report it to.
        try {
          controller.error(err);
        } catch {
          // stream already closed or errored — nothing to surface
        }
      }
    },
    cancel(reason) {
      try {
        reader.cancel(reason);
      } catch {
        // noop
      }
    },
  });

  return { matched: null, replacementBody };
}
