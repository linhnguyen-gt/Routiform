/**
 * Emits the compression summary on the outgoing response.
 *
 * `formatStackHeader` has always produced this string and the pipeline has always stored it on
 * `p.compressionHeader`, but nothing ever read it back — the MCP tool that documents the header
 * described the wire-up as "optional". Users therefore had no way to see whether compression ran
 * or what it saved.
 *
 * Attaching it in one place covers the streaming and non-streaming paths together, which is why
 * this runs at the orchestrator boundary rather than inside each response phase.
 */

export const COMPRESSION_HEADER_NAME = "X-Routiform-Compression";

interface ResultLike {
  response?: unknown;
}

/**
 * Set the header on `result.response` when both the response and the summary exist.
 *
 * Never throws: a response whose headers are immutable (an upstream body passed straight through,
 * for example) must not fail the request just because a diagnostic header could not be attached.
 */
export function attachCompressionHeader<T extends ResultLike>(
  result: T,
  compressionHeader: string | undefined
): T {
  if (!compressionHeader) return result;

  const response = result?.response;
  if (!response || typeof response !== "object") return result;

  const headers = (response as { headers?: unknown }).headers;
  if (!headers || typeof (headers as Headers).set !== "function") return result;

  try {
    (headers as Headers).set(COMPRESSION_HEADER_NAME, compressionHeader);
  } catch {
    // Immutable headers — the response is still valid, it just carries no summary.
  }

  return result;
}
