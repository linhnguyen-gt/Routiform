/**
 * Header utility functions
 * Extracted from chatCore.ts for better modularity
 */

/**
 * Gets a header value case-insensitively from a headers object
 * @param headers - Headers object to search
 * @param targetName - Header name to find (case-insensitive)
 * @returns Header value as string, or null if not found
 */
export function getHeaderValueCaseInsensitive(
  headers: Record<string, unknown> | null | undefined,
  targetName: string
): string | null {
  if (!headers || typeof headers !== "object") return null;
  const lowered = targetName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowered) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
        return value[0];
      }
    }
  }
  return null;
}
