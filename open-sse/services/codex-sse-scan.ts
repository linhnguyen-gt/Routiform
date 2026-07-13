// Codex SSE frame classification.
//
// Codex sometimes returns HTTP 200 whose SSE *body* carries the real error —
// the client would otherwise see an empty stream with no retry/failover.
// This module decides, for a single SSE frame, whether it is such an error
// frame (and which kind), a harmless preamble, or the first real content frame.
//
// Extracted verbatim from executors/codex.ts; the peek loop that drives it
// lives in codex-sse-peek.ts.

// "server_is_overloaded" is transient (retry the same account); a capacity
// message means Codex has no room for this account on this model (rotate
// accounts instead). Checked lowercase, so patterns are already lowercase.
export const CODEX_SSE_RETRY_PATTERNS = ["server_is_overloaded", "service_unavailable_error"];
export const CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS = [
  "selected model is at capacity",
  "model_at_capacity",
];

// Only SSE frames carrying these event types are ever inspected for the retry
// / account-fallback patterns. Content-bearing event types (response.output_
// text.delta, function_call_arguments.delta, etc.) are never in this set, so
// the model's own generated text can never be pattern-matched.
const CODEX_SSE_ERROR_EVENT_TYPES = new Set(["error", "response.failed", "response.incomplete"]);
// Preamble events that carry no content and may legitimately precede an error
// or the first content frame — safe to skip past without stopping the peek.
const CODEX_SSE_PREAMBLE_EVENT_TYPES = new Set([
  "response.created",
  "response.in_progress",
  "response.queued",
]);

export type CodexSseFrameClassification =
  | "preamble"
  | "error-retry"
  | "error-fallback"
  | "error-unmatched"
  | "content"
  | null;

/**
 * Extract only the structured error-message-shaped fields from a decoded SSE
 * error frame — never the whole JSON blob, and never a `delta`/`output_*`
 * content field. This is what makes it impossible for the model's own
 * generated text to be seen by the retry/fallback pattern match: those
 * fields only ever appear on content event types, which this function is
 * never called for (see scanCodexSseFrame — it only runs on frames already
 * classified as an error event type).
 */
export function extractCodexSseErrorText(json: Record<string, unknown>): string {
  const record = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const error = record(json.error);
  const response = record(json.response);
  const responseError = response ? record(response.error) : null;
  const statusDetails = response ? record(response.status_details) : null;
  const incompleteDetails = response ? record(response.incomplete_details) : null;

  const candidates: unknown[] = [
    json.message,
    error?.message,
    error?.code,
    responseError?.message,
    responseError?.code,
    statusDetails?.reason,
    incompleteDetails?.reason,
    json.reason,
  ];
  return candidates.filter((v): v is string => typeof v === "string").join(" ");
}

/**
 * Classify a single SSE frame (the text between two `\n\n` boundaries, or the
 * trailing frame at stream end). The event type is read from the `event:`
 * line when present, falling back to `data.type` / `data.object` for frames
 * that only carry it in the JSON payload (content deltas from the real
 * Responses API wire format do this).
 *
 * A frame is treated as a candidate error frame either when its event type is
 * one of CODEX_SSE_ERROR_EVENT_TYPES, OR when its JSON payload carries a
 * structured `error` object — the shape actually observed from Codex's 200-OK
 * error bodies is a bare `{"error":{"message": "..."}}` payload with no
 * `event:`/`type` discriminator at all. Content event types never carry a
 * top-level `error` object, so this cannot misfire on generated text.
 *
 * Returns "content" for any event type that is not a known preamble/error
 * type — the caller stops peeking the instant this is returned, which is what
 * keeps a healthy stream from ever being buffered past its first real event.
 */
export function scanCodexSseFrame(frameText: string): CodexSseFrameClassification {
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const rawLine of frameText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) continue; // blank / SSE comment-keepalive
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (dataLine === null && line.startsWith("data:")) {
      dataLine = line.slice("data:".length).trim();
    }
  }

  if (!dataLine || dataLine === "[DONE]") return null;

  let json: Record<string, unknown>;
  try {
    const parsed = JSON.parse(dataLine);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    json = parsed as Record<string, unknown>;
  } catch {
    return null; // unparseable frame — ignore it, keep scanning (fail open per-frame)
  }

  const type =
    eventName ||
    (typeof json.type === "string" ? json.type : "") ||
    (typeof json.object === "string" ? json.object : "");

  if (CODEX_SSE_PREAMBLE_EVENT_TYPES.has(type)) return "preamble";

  const hasStructuredErrorField =
    json.error !== undefined &&
    json.error !== null &&
    typeof json.error === "object" &&
    !Array.isArray(json.error);

  if (CODEX_SSE_ERROR_EVENT_TYPES.has(type) || hasStructuredErrorField) {
    const errorText = extractCodexSseErrorText(json).toLowerCase();
    if (CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS.some((p) => errorText.includes(p))) {
      return "error-fallback";
    }
    if (CODEX_SSE_RETRY_PATTERNS.some((p) => errorText.includes(p))) {
      return "error-retry";
    }
    return "error-unmatched"; // terminal error frame, but not one of our known signatures
  }

  if (!type) return null; // no recognizable event type — ignore, keep scanning

  // Any other named event type (response.output_text.delta, response.output_
  // item.added, response.function_call_arguments.delta, response.completed,
  // future/unknown types, ...) means real generation has started.
  return "content";
}
