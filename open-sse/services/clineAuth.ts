/**
 * Cline (api.cline.bot) expects OAuth access tokens in WorkOS form:
 *   Authorization: Bearer workos:<token>
 * A bare JWT without the `workos:` prefix returns 401 with a generic "re-authenticate" message.
 * @see 9router/src/shared/utils/clineAuth.js (aligned with official Cline extension behavior)
 */

const CLIENT_VERSION = "3.5.2";

/**
 * Normalize stored token for Cline API requests.
 */
export function getClineAccessToken(token: string | null | undefined): string {
  if (typeof token !== "string") return "";
  const trimmed = token.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("workos:") ? trimmed : `workos:${trimmed}`;
}

/**
 * Headers for Cline OpenAI-compatible chat endpoint (and auth probe).
 */
export function buildClineHeaders(
  token: string | null | undefined,
  stream: boolean
): Record<string, string> {
  const access = getClineAccessToken(token ?? "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline",
    "User-Agent": `OmniRoute/${CLIENT_VERSION}`,
    "X-PLATFORM": typeof process !== "undefined" ? process.platform : "unknown",
    "X-PLATFORM-VERSION": typeof process !== "undefined" ? process.version : "unknown",
    "X-CLIENT-TYPE": "omniroute",
    "X-CLIENT-VERSION": CLIENT_VERSION,
    "X-CORE-VERSION": CLIENT_VERSION,
    "X-IS-MULTIROOT": "false",
  };
  if (access) {
    headers.Authorization = `Bearer ${access}`;
  }
  headers.Accept = stream ? "text/event-stream" : "application/json";
  return headers;
}
