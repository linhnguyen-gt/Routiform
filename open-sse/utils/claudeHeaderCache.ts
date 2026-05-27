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

function isClaudeCodeClient(headers: Record<string, string>): boolean {
  const ua = (headers["user-agent"] || "").toLowerCase();
  const xApp = (headers["x-app"] || "").toLowerCase();
  return ua.includes("claude-cli") || ua.includes("claude-code") || xApp === "cli";
}

export function cacheClaudeHeaders(headers: HeaderLike): void {
  const normalized = normalizeHeaders(headers);
  if (!isClaudeCodeClient(normalized)) return;

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
