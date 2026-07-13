export function isDroidCliUserAgent(userAgent: unknown): boolean {
  if (typeof userAgent !== "string") return false;

  const normalized = userAgent.toLowerCase();
  return (
    normalized.includes("codex-cli") ||
    normalized.includes("droid-cli") ||
    normalized.includes(" droid/")
  );
}

/**
 * Narrow, exact detector for the real Claude Code CLI binary — matches only
 * the "claude-cli" substring real Claude Code sends
 * (`claude-cli/<version> (external, cli)`, see
 * services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT).
 *
 * This is the canonical source for utils/bypassHandler.ts's Claude-CLI-only
 * bypass gate. Do NOT widen this to match "claude-code"/"claude_code" —
 * those are handled by the broader isClaudeCodeUserAgent below, and
 * bypassHandler's patterns are specific to Claude CLI's internal protocol.
 */
export function isClaudeCliUserAgent(userAgent: unknown): boolean {
  if (typeof userAgent !== "string") return false;
  return userAgent.toLowerCase().includes("claude-cli");
}

/**
 * Canonical, most-complete Claude Code detector — matches every known
 * spelling seen across call sites: the real "claude-cli" UA, "claude-code",
 * the underscored "claude_code" variant, and the generic "anthropic cli".
 *
 * Used as the single source of truth by clients that want the widest
 * reasonable match (e.g. utils/claudeHeaderCache.ts). NOT used by
 * utils/cacheControlPolicy.ts's isClaudeCodeClient, which intentionally
 * keeps its own narrower, unmodified logic (excluding "claude-cli") — see
 * that file for why.
 */
export function isClaudeCodeUserAgent(userAgent: unknown): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("claude-cli") ||
    ua.includes("claude-code") ||
    ua.includes("claude_code") ||
    (ua.includes("anthropic") && ua.includes("cli"))
  );
}

/**
 * Known coding-agent User-Agent substrings (add as new agents emerge).
 * Coding agents read files / grep results to plan edits — the dangerous
 * middle-cutting filters (read-numbered, smart-truncate) and aggressive
 * grep/find caps must not run against their traffic. Canonical source for
 * rtk/profile-resolver.ts's "safe" vs "full" gate.
 */
export const CODING_AGENT_USER_AGENT_SIGNATURES = [
  "claude-cli", // Claude Code (real UA — was missing, see Fix 1)
  "claude-code",
  "claude_code", // Claude Code underscored variant
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

/** Is this a known coding-agent client? See CODING_AGENT_USER_AGENT_SIGNATURES. */
export function isCodingAgentUserAgent(userAgent: unknown): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.toLowerCase();
  return CODING_AGENT_USER_AGENT_SIGNATURES.some((sig) => ua.includes(sig));
}
