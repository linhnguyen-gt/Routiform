import { isClaudeCodeUserAgent } from "./clientDetection.ts";

const CLAUDE_IDENTITY_HEADERS = [
  "user-agent",
  "anthropic-beta",
  "anthropic-version",
  "anthropic-dangerous-direct-browser-access",
  "x-app",
  "x-stainless-helper-method",
  "x-stainless-retry-count",
  "x-stainless-runtime-version",
  "x-stainless-package-version",
  "x-stainless-runtime",
  "x-stainless-lang",
  "x-stainless-arch",
  "x-stainless-os",
  "x-stainless-timeout",
  "x-claude-code-session-id",
  "package-version",
  "runtime-version",
  "os",
  "arch",
] as const;

type HeaderLike =
  | Headers
  | Record<string, string | undefined>
  | Record<string, unknown>
  | null
  | undefined;

let cachedHeaders: Record<string, string> | null = null;

function normalizeHeaders(headers: HeaderLike): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(
      Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), String(value)])
    );
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.length > 0) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

// Header-aware wrapper: inspects both the User-Agent (delegated to the
// canonical isClaudeCodeUserAgent detector) and the x-app header, which the
// UA alone can't see. Renamed from the former `isClaudeCodeClient` to avoid
// colliding with utils/cacheControlPolicy.ts's function of the same name,
// which intentionally has different (narrower) matching logic — see that
// file for why the two are NOT unified.
//
// BEHAVIOUR CHANGE: delegating the UA check to isClaudeCodeUserAgent widens
// this from (claude-cli | claude-code | x-app=cli) to also match the
// "claude_code" underscored variant and "anthropic cli" — both legitimate
// Claude-Code-family spellings, so identity headers are now also cached for
// them. This is a deliberate widening, not a narrowing: every UA this
// function matched before still matches now.
function isClaudeCodeRequest(headers: Record<string, string>): boolean {
  const xApp = (headers["x-app"] || "").toLowerCase();
  return isClaudeCodeUserAgent(headers["user-agent"]) || xApp === "cli";
}

export function cacheClaudeHeaders(headers: HeaderLike): void {
  const normalized = normalizeHeaders(headers);
  if (!isClaudeCodeRequest(normalized)) return;

  const captured: Record<string, string> = {};
  for (const key of CLAUDE_IDENTITY_HEADERS) {
    if (normalized[key]) {
      captured[key] = normalized[key];
    }
  }

  if (Object.keys(captured).length > 0) {
    cachedHeaders = captured;
  }
}

export function getCachedClaudeHeaders(): Record<string, string> | null {
  return cachedHeaders ? { ...cachedHeaders } : null;
}

export function clearCachedClaudeHeaders(): void {
  cachedHeaders = null;
}
