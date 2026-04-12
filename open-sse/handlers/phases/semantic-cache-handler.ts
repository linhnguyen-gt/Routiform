import { getCachedResponse, generateSignature, isCacheable } from "../../../src/lib/semanticCache.ts";
import { getCorsOrigin } from "../../utils/cors.ts";

/**
 * Semantic cache handler phase
 * Extracted from chatCore.ts for better modularity
 */

/**
 * Checks semantic cache for a matching response
 * Only applies to non-streaming requests with temperature=0
 *
 * @param model - Model name
 * @param body - Request body
 * @param clientRawRequest - Raw client request with headers
 * @param log - Logger instance
 * @returns Response if cache hit, null otherwise
 */
export function checkSemanticCache(
  model: string,
  body: Record<string, unknown>,
  clientRawRequest: { headers?: Record<string, string> } | null | undefined,
  log?: {
    debug?: (category: string, message: string) => void;
  }
): Response | null {
  if (!isCacheable(body, clientRawRequest?.headers)) {
    return null;
  }

  const signature = generateSignature(
    model,
    body.messages,
    typeof body.temperature === "number" ? body.temperature : undefined,
    typeof body.top_p === "number" ? body.top_p : undefined
  );
  const cached = getCachedResponse(signature);

  if (cached) {
    log?.debug?.("CACHE", `Semantic cache HIT for ${model}`);
    return new Response(JSON.stringify(cached), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getCorsOrigin(),
        "X-Routiform-Cache": "HIT",
      },
    });
  }

  return null;
}
