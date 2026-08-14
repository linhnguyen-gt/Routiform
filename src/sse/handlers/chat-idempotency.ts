import { CORS_ORIGIN } from "@/shared/utils/cors";
import { checkIdempotency, getIdempotencyKey, saveIdempotency } from "@/lib/idempotencyLayer";

/**
 * Ingress-scoped idempotency for the chat endpoint.
 *
 * Idempotency is a property of one **client** request: the same key must yield
 * the same response to the caller. It is deliberately NOT evaluated per upstream
 * attempt. A single client request fans out into many attempts — combo fallback,
 * account fallback, same-model retry — and every one of them carries the caller's
 * original headers. Running the check inside the per-attempt pipeline made
 * attempt 2 replay attempt 1's cached body instead of calling its own provider,
 * so a combo silently collapsed to its first model and every fallback "failed"
 * with the first model's response.
 *
 * Both halves therefore live here, at the single ingress, and `chat-core` knows
 * nothing about idempotency.
 */

type HeadersLike = Headers | Record<string, unknown> | null | undefined;

/** Read the caller's key: `Idempotency-Key`, else `X-Request-Id`. */
export function readIdempotencyKey(headers: HeadersLike): string | null {
  return getIdempotencyKey(headers) || null;
}

/**
 * Replay the response already produced for this key, if one is still cached.
 *
 * Streaming callers are never served from the cache: only JSON bodies are stored,
 * and handing one to a client waiting on an event stream would break the parse.
 */
export function serveIdempotentResponse(
  key: string | null,
  stream: boolean,
  log?: { debug?: (category: string, message: string) => void }
): Response | null {
  if (!key || stream) return null;

  const cached = checkIdempotency(key);
  if (!cached) return null;

  log?.debug?.("IDEMPOTENCY", `Hit for key=${key.slice(0, 12)}...`);
  return new Response(JSON.stringify(cached.response), {
    status: cached.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "X-Routiform-Idempotent": "true",
    },
  });
}

/**
 * Cache the response the client is actually about to receive.
 *
 * Only successful non-streaming JSON is stored — caching a body that the combo
 * layer went on to reject would hand the next duplicate a response this request
 * never returned.
 */
export async function captureIdempotentResponse(
  key: string | null,
  response: Response,
  stream: boolean
): Promise<void> {
  if (!key || stream || !response?.ok) return;
  if (!(response.headers.get("content-type") || "").includes("application/json")) return;
  if (response.headers.get("X-Routiform-Idempotent") === "true") return;

  try {
    saveIdempotency(key, await response.clone().json(), response.status);
  } catch {
    /* unreadable or non-JSON body — nothing worth replaying */
  }
}
