/**
 * AI SDK compatibility helpers (T26).
 */

/**
 * Detects when a client explicitly prefers JSON (non-SSE) responses.
 */
export function clientWantsJsonResponse(acceptHeader: unknown): boolean {
  if (typeof acceptHeader !== "string") return false;
  const normalized = acceptHeader.toLowerCase();
  return normalized.includes("application/json") && !normalized.includes("text/event-stream");
}

/** True only when the caller named SSE in Accept, rather than merely not ruling it out. */
export function clientWantsEventStream(acceptHeader: unknown): boolean {
  return (
    typeof acceptHeader === "string" && acceptHeader.toLowerCase().includes("text/event-stream")
  );
}

/**
 * Resolves stream behavior from request body + Accept header.
 * Priority: explicit `stream: true/false` in body wins.
 * Accept header only acts as fallback when stream is not explicitly set.
 * Fixes #656: clients sending both `stream: true` and `Accept: application/json`
 * should still get streaming responses — body intent takes precedence.
 *
 * With no `stream` in the body the OpenAI default is false, so the fallback asks
 * whether the caller named `text/event-stream` rather than whether it failed to
 * rule SSE out. The looser test sent an event stream to anyone who omitted both
 * the field and a specific Accept header — curl's wildcard default among them —
 * and an OpenAI-compatible client waiting on a JSON body never got one.
 */
export function resolveStreamFlag(bodyStream: unknown, acceptHeader: unknown): boolean {
  // Explicit body value always wins
  if (bodyStream === true) return true;
  if (bodyStream === false) return false;
  // No explicit stream param — stream only for a caller that asked for SSE
  return clientWantsEventStream(acceptHeader);
}

/**
 * Accept compatibility aliases used by some clients.
 *
 * Non-stream aliases (force JSON/non-SSE):
 * - non_stream: true
 * - disable_stream: true
 * - disable_streaming: true
 * - streaming: false
 *
 * Stream alias:
 * - streaming: true
 */
export function resolveExplicitStreamAlias(body: unknown): boolean | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;

  if (b.non_stream === true) return false;
  if (b.disable_stream === true) return false;
  if (b.disable_streaming === true) return false;
  if (b.streaming === false) return false;
  if (b.streaming === true) return true;

  return undefined;
}

/**
 * Remove non-standard stream aliases at the API boundary.
 */
export function stripNonStandardStreamAliases(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const b = body as Record<string, unknown>;
  delete b.non_stream;
  delete b.disable_stream;
  delete b.disable_streaming;
  delete b.streaming;
}

/**
 * Removes surrounding markdown code fences when Claude wraps JSON payloads.
 * Example: ```json\n{"ok":true}\n``` -> {"ok":true}
 */
export function stripMarkdownCodeFence(text: unknown): unknown {
  if (typeof text !== "string") return text;
  const codeBlockRegex = /^```(?:json|javascript|typescript|js|ts)?\s*\n?([\s\S]*?)\n?```\s*$/i;
  const match = text.trim().match(codeBlockRegex);
  return match ? match[1].trim() : text;
}
