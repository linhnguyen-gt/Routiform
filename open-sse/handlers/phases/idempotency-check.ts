import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotencyLayer";
import { getCorsOrigin } from "../../utils/cors.ts";

/**
 * Idempotency check phase handler
 * Extracted from chatCore.ts for better modularity
 */

/**
 * Checks if a request has been processed before using idempotency key
 * @param clientRawRequest - Raw client request containing headers
 * @param log - Logger instance
 * @returns Response if idempotent hit found, null otherwise
 */
export function handleIdempotencyCheck(
  clientRawRequest: { headers?: Record<string, string> } | null | undefined,
  log?: {
    debug?: (category: string, message: string) => void;
  }
): Response | null {
  const idempotencyKey = getIdempotencyKey(clientRawRequest?.headers);
  const cachedIdemp = checkIdempotency(idempotencyKey);

  if (cachedIdemp) {
    log?.debug?.("IDEMPOTENCY", `Hit for key=${idempotencyKey?.slice(0, 12)}...`);
    return new Response(JSON.stringify(cachedIdemp.response), {
      status: cachedIdemp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getCorsOrigin(),
        "X-Routiform-Idempotent": "true",
      },
    });
  }

  return null;
}
