import type { CavemanOutputLevel } from "./types.ts";

/**
 * Deep-clone a JSON-safe request body for inflation-guard restore.
 */
export function snapshotBody(body: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
}

/**
 * Decide the pristine (`rawBody`) and mutable-working (`body`) references
 * the compression stage should use.
 *
 * The real caller (chat-core-phase-translate-and-bundle.ts) receives a body
 * that may be ALIASED with the caller's own object: the credential-retry
 * loop and combo inner-retry loop reuse the same client body across
 * attempts via a shallow `{ ...body, model }` spread (see
 * src/sse/handlers/chat.ts:836), so nested arrays/objects (`messages`,
 * `system`, `systemInstruction.parts`) are the SAME references the caller
 * (and every subsequent retry attempt) holds. `applyStackedCompression`
 * mutates its input in place, so handing it the aliased body would corrupt
 * the caller's own data and re-inject on every retry.
 *
 * When compression cannot mutate anything — the input-side stack is
 * disabled AND the output-side directive is off — `body` IS `rawBody` (no
 * clone): the default request stays byte-identical with zero clone cost,
 * even on multi-MB agentic payloads with base64 images.
 */
export function resolveCompressionBodies(
  body: Record<string, unknown>,
  options: { compressionEnabled: boolean; cavemanOutputLevel: CavemanOutputLevel }
): { rawBody: Record<string, unknown>; body: Record<string, unknown> } {
  const mutationPossible = options.compressionEnabled || options.cavemanOutputLevel !== "off";
  if (!mutationPossible) {
    return { rawBody: body, body };
  }
  return { rawBody: body, body: snapshotBody(body) };
}

export function measureBodyBytes(body: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(body), "utf8");
}

/**
 * If compressed body is larger than the pre-compression snapshot, restore snapshot.
 * Returns true when reverted.
 */
export function applyInflationGuard(
  body: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  bytesBefore: number
): { reverted: boolean; bytesAfter: number } {
  const bytesAfter = measureBodyBytes(body);
  if (bytesAfter > bytesBefore) {
    for (const key of Object.keys(body)) {
      delete body[key];
    }
    Object.assign(body, snapshotBody(snapshot));
    return { reverted: true, bytesAfter: bytesBefore };
  }
  return { reverted: false, bytesAfter };
}
