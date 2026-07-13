import test from "node:test";
import assert from "node:assert/strict";

const { isDroidCliUserAgent, isClaudeCliUserAgent, isClaudeCodeUserAgent, isCodingAgentUserAgent } =
  await import("../../open-sse/utils/clientDetection.ts");

// Real Claude Code CLI sends this exact User-Agent (verified against
// open-sse/services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT,
// which builds `claude-cli/${VERSION} (external, cli)` to impersonate it).
const REAL_CLAUDE_CODE_UA = "claude-cli/2.1.63 (external, cli)";
// Legacy spelling used by pre-existing tests. Not observed in the wild, but
// kept for backward compatibility since some detectors historically matched it.
const LEGACY_CLAUDE_CODE_UA = "Claude-Code/1.0.0";

test("client detection: detects codex-cli user agent", () => {
  assert.equal(isDroidCliUserAgent("codex-cli/0.92.0 (Windows 10.0.26100; x64)"), true);
});

test("client detection: detects droid-cli user agent", () => {
  assert.equal(isDroidCliUserAgent("droid-cli/1.2.3"), true);
});

test("client detection: does not treat generic android UA as droid cli", () => {
  const androidUa =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36";
  assert.equal(isDroidCliUserAgent(androidUa), false);
});

test("client detection: handles unknown user agent safely", () => {
  assert.equal(isDroidCliUserAgent(undefined), false);
  assert.equal(isDroidCliUserAgent(null), false);
  assert.equal(isDroidCliUserAgent(123), false);
});

test("isClaudeCliUserAgent: matches only the real claude-cli spelling (narrow, exact bypassHandler semantics)", () => {
  assert.equal(isClaudeCliUserAgent(REAL_CLAUDE_CODE_UA), true);
  assert.equal(isClaudeCliUserAgent(LEGACY_CLAUDE_CODE_UA), false);
  assert.equal(isClaudeCliUserAgent("claude-code/1.0.0"), false);
  assert.equal(isClaudeCliUserAgent(undefined), false);
  assert.equal(isClaudeCliUserAgent(null), false);
});

test("isClaudeCodeUserAgent: matches every known Claude Code spelling (superset)", () => {
  assert.equal(isClaudeCodeUserAgent(REAL_CLAUDE_CODE_UA), true);
  assert.equal(isClaudeCodeUserAgent(LEGACY_CLAUDE_CODE_UA), true);
  assert.equal(isClaudeCodeUserAgent("claude_code/2.0"), true);
  assert.equal(isClaudeCodeUserAgent("Anthropic CLI/3.0"), true);
  assert.equal(isClaudeCodeUserAgent("curl/8.0"), false);
  assert.equal(isClaudeCodeUserAgent(undefined), false);
});

test("isCodingAgentUserAgent: recognises the real Claude Code UA (Fix 1 — was missing claude-cli)", () => {
  assert.equal(isCodingAgentUserAgent(REAL_CLAUDE_CODE_UA), true);
  assert.equal(isCodingAgentUserAgent(LEGACY_CLAUDE_CODE_UA), true);
  assert.equal(isCodingAgentUserAgent("cursor/0.42"), true);
  assert.equal(isCodingAgentUserAgent("Mozilla/5.0 browser"), false);
});
