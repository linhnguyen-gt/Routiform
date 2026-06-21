// Resolve which RTK profile to apply for a given request.
// Centralises the "which profile for this request" decision so it can be
// updated without touching compress logic.
import type { RtkProfile } from "./types.ts";

// Known coding-agent User-Agent substrings (add as new agents emerge).
// Coding agents read files / grep results to plan edits — the dangerous
// middle-cutting filters (read-numbered, smart-truncate) and aggressive
// grep/find caps must not run against their traffic.
const CODING_AGENT_UA = [
  "claude-code",
  "claude_code", // Claude Code (also covered by isClaudeCodeClient)
  "anthropic cli", // Claude Code alt UA
  "openclaw", // OpenClaw
  "hermes", // Hermes
  "cursor", // Cursor
  "codex", // OpenAI Codex
  "cline", // Cline
  "roo", // Roo Code
  "windsurf", // Windsurf
  "opencode", // OpenCode
  "continue", // Continue.dev
  "kilocode", // Kilo Code
  "devin", // Devin
] as const;

/**
 * Resolve the RTK profile for a request.
 *
 * @param compressionEnabled Whether the user has opted into auto-compress
 *        (the Dashboard "AI request context" toggle). When false → "off".
 * @param userAgent The client User-Agent header. When null/undefined and
 *        compression is enabled, the client is treated as unknown and the
 *        "full" profile applies (the user opted in, so compress by default).
 * @returns "off" | "safe" | "full"
 */
export function resolveRtkProfile(
  compressionEnabled: boolean,
  userAgent: string | null | undefined
): RtkProfile {
  if (!compressionEnabled) return "off";
  if (!userAgent) return "full"; // unknown client — apply full (user opted in)
  const ua = userAgent.toLowerCase();
  if (CODING_AGENT_UA.some((sig) => ua.includes(sig))) return "safe"; // coding agent — safe only
  return "full"; // casual chat, browser, etc.
}
