/**
 * Applies response-side PII handling to the outgoing response.
 *
 * `sanitizePIIResponse` and `sanitizePIIChunk` were exported and called from nowhere — only the
 * logging paths used the sanitizer. Fixing `block` mode alone would have turned a known-absent
 * control into a believed-present one, so the wiring and the mode land together.
 *
 * Scope, stated plainly: this covers **buffered JSON responses only**. Streaming is deliberately
 * not claimed — `sanitizePIIChunk` is synchronous with no channel to terminate a stream, and a
 * regex sweep over independent SSE deltas cannot see `john@` and `example.com` when they land in
 * different chunks. Claiming streaming coverage without an overlap window would be the same class
 * of untrue claim this fix exists to remove.
 */

import { sanitizePII, sanitizePIIResponse } from "../../../src/lib/piiSanitizer";

export const PII_BLOCK_MESSAGE =
  "Response withheld: the upstream reply contained personal data and PII blocking is enabled.";

function isEnabled(): boolean {
  return process.env.PII_RESPONSE_SANITIZATION === "true";
}

function mode(): "redact" | "warn" | "block" {
  const raw = process.env.PII_RESPONSE_SANITIZATION_MODE;
  return raw === "warn" || raw === "block" ? raw : "redact";
}

/**
 * Whether the payload contains PII, asked independently of the configured mode.
 *
 * `sanitizePII` only returns rewritten text under `redact`, so comparing before and after would
 * report "clean" under exactly the mode that is supposed to act on a detection. The detection list
 * is the honest signal.
 */
function detectedPii(body: unknown): boolean {
  try {
    return sanitizePII(JSON.stringify(body)).detections.length > 0;
  } catch {
    return false;
  }
}

interface PiiOutcome {
  body: unknown;
  blocked: boolean;
}

/**
 * Apply the configured mode to a parsed response body.
 *
 * `redact` replaces the matches, `warn` passes the body through (the sanitizer logs), and `block`
 * withholds the body entirely — previously it was accepted and then silently behaved as
 * pass-through.
 */
export function applyPiiPolicy(body: unknown): PiiOutcome {
  if (!isEnabled() || body == null) return { body, blocked: false };

  if (mode() !== "block") {
    return { body: sanitizePIIResponse(structuredClone(body)), blocked: false };
  }

  if (!detectedPii(body)) {
    return { body, blocked: false };
  }

  return { body: { error: { message: PII_BLOCK_MESSAGE, type: "pii_blocked" } }, blocked: true };
}

interface ResultLike {
  response?: unknown;
}

/**
 * Rewrite a buffered JSON response through the PII policy.
 *
 * Streaming responses and non-JSON bodies are returned untouched — see the module note. Any
 * failure leaves the response as-is rather than failing the request.
 */
export async function applyPiiToResponse<T extends ResultLike>(result: T): Promise<T> {
  if (!isEnabled()) return result;

  const response = result?.response;
  if (!(response instanceof Response)) return result;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return result;

  try {
    const original = await response.clone().json();
    const { body, blocked } = applyPiiPolicy(original);
    if (body === original) return result;

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    result.response = new Response(JSON.stringify(body), {
      status: blocked ? 502 : response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // Unparseable body — leave the response alone rather than failing the request.
  }

  return result;
}
