import { randomUUID } from "node:crypto";

import {
  CLAUDE_CODE_COMPATIBLE_ANTHROPIC_BETA,
  CLAUDE_CODE_COMPATIBLE_ANTHROPIC_VERSION,
  CLAUDE_CODE_COMPATIBLE_STAINLESS_TIMEOUT_SECONDS,
  CLAUDE_CODE_COMPATIBLE_USER_AGENT,
} from "./constants.ts";

type HeaderLike =
  | Headers
  | Record<string, string | undefined>
  | { get?: (name: string) => string | null }
  | null
  | undefined;

function getHeader(headers: HeaderLike, name: string): string | null {
  if (!headers) return null;

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }

  const record = headers as Record<string, string | undefined>;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === target) {
      return value ?? null;
    }
  }
  return null;
}

export function buildClaudeCodeCompatibleHeaders(
  apiKey: string,
  stream = false,
  sessionId?: string | null
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
    "x-api-key": apiKey,
    "anthropic-version": CLAUDE_CODE_COMPATIBLE_ANTHROPIC_VERSION,
    "anthropic-beta": CLAUDE_CODE_COMPATIBLE_ANTHROPIC_BETA,
    "anthropic-dangerous-direct-browser-access": "true",
    "x-app": "cli",
    "User-Agent": CLAUDE_CODE_COMPATIBLE_USER_AGENT,
    "X-Stainless-Retry-Count": "0",
    "X-Stainless-Timeout": String(CLAUDE_CODE_COMPATIBLE_STAINLESS_TIMEOUT_SECONDS),
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": "0.80.0",
    "X-Stainless-OS": "MacOS",
    "X-Stainless-Arch": "arm64",
    "X-Stainless-Runtime": "node",
    "X-Stainless-Runtime-Version": "v24.3.0",
    "accept-language": "*",
    "sec-fetch-mode": "cors",
    "accept-encoding": "identity",
    ...(sessionId ? { "X-Claude-Code-Session-Id": sessionId } : {}),
    "x-client-request-id": randomUUID(),
  };
}

export function resolveClaudeCodeCompatibleSessionId(headers?: HeaderLike): string {
  const raw =
    getHeader(headers, "x-claude-code-session-id") ||
    getHeader(headers, "x-session-id") ||
    getHeader(headers, "x_session_id") ||
    getHeader(headers, "x-routiform-session") ||
    getHeader(headers, "x-routiform-session") ||
    null;

  return (raw && raw.trim()) || randomUUID();
}
