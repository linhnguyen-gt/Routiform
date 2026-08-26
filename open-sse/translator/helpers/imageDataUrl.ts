// Shared parser for OpenAI-style `image_url` data URLs.
// Request translators (Claude, Gemini) and the response translator all need the
// same `data:<mime>;base64,<payload>` decomposition; keeping it in one place
// avoids divergent regexes that silently accept different URL shapes.

export type ParsedDataImageUrl = {
  mimeType: string;
  data: string;
};

/**
 * Parse a base64 `data:` URL into its MIME type and payload.
 * Returns null for non-data URLs, non-base64 payloads, or malformed input.
 */
export function parseDataImageUrl(url: unknown): ParsedDataImageUrl | null {
  if (typeof url !== "string") return null;
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}
