import test from "node:test";
import assert from "node:assert/strict";

const { resolveRtkProfile } = await import("../../open-sse/rtk/profile-resolver.ts");
const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");

// Real Claude Code sends this exact User-Agent — verified against
// open-sse/services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT
// (`claude-cli/${VERSION} (external, cli)`), which impersonates it, and
// open-sse/utils/bypassHandler.ts, whose working-in-production Claude-Code
// bypass gates on `userAgent.includes("claude-cli")`.
const REAL_CLAUDE_CODE_UA = "claude-cli/2.1.63 (external, cli)";
// Legacy spelling — kept only because pre-existing tests exercised it, not
// because any real client sends it.
const LEGACY_CLAUDE_CODE_UA = "Claude-Code/1.0.0";

// Line-numbered file-read dump shaped so autodetect's 1024-char peek window
// (DETECT_WINDOW) still contains >=250 lines (SMART_TRUNCATE_MIN_LINES) —
// short lines are required for the autodetector itself to classify this as
// "read-numbered" before the safe/full gate ever runs.
function makeReadNumbered() {
  return Array.from({ length: 400 }, (_, i) => `${(i % 9) + 1}|a`).join("\n");
}

test("resolveRtkProfile: real Claude Code UA gets the safe profile (Fix 1 — was 'full')", () => {
  assert.equal(resolveRtkProfile(true, REAL_CLAUDE_CODE_UA), "safe");
  assert.equal(resolveRtkProfile(true, LEGACY_CLAUDE_CODE_UA), "safe");
});

test("applyStackedCompression: real Claude Code request skips read-numbered/smart-truncate (auto-compress enabled)", () => {
  const body = {
    messages: [{ role: "tool", content: makeReadNumbered() }],
  };
  const before = body.messages[0].content;

  const result = applyStackedCompression(body, {
    enabled: true, // dashboard "AI request context" (auto-compress) toggle
    userAgent: REAL_CLAUDE_CODE_UA,
    caveman: false,
  });

  assert.equal(result.rtkProfile, "safe");
  // read-numbered is a lossy middle-cutting filter (UNSAFE_FILTER_NAMES) —
  // it must not run against a real Claude Code request reading a file.
  assert.equal(body.messages[0].content, before);
  assert.equal(result.rtkStats?.hits?.length ?? 0, 0);
});

test("applyStackedCompression: unknown/casual client still gets the full profile (no regression)", () => {
  const body = {
    messages: [{ role: "tool", content: makeReadNumbered() }],
  };
  const before = body.messages[0].content;

  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "Mozilla/5.0 browser",
    caveman: false,
  });

  assert.equal(result.rtkProfile, "full");
  assert.notEqual(body.messages[0].content, before);
  assert.ok((result.rtkStats?.hits?.length ?? 0) > 0);
});
