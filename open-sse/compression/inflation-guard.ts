/**
 * Deep-clone a JSON-safe request body for inflation-guard restore.
 */
export function snapshotBody(body: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
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
