// Resolve which RTK profile to apply for a given request.
// Centralises the "which profile for this request" decision so it can be
// updated without touching compress logic.
import { isCodingAgentUserAgent } from "../utils/clientDetection.ts";
import type { RtkProfile } from "./types.ts";

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
  // Coding agents read files / grep results to plan edits — the dangerous
  // middle-cutting filters (read-numbered, smart-truncate) and aggressive
  // grep/find caps must not run against their traffic. See
  // utils/clientDetection.ts CODING_AGENT_USER_AGENT_SIGNATURES for the list
  // (Fix 1: now includes "claude-cli", the real Claude Code UA — it was
  // missing, so real Claude Code was getting the lossy "full" profile).
  if (isCodingAgentUserAgent(userAgent)) return "safe"; // coding agent — safe only
  return "full"; // casual chat, browser, etc.
}
