import test from "node:test";
import assert from "node:assert/strict";

const { handleBypassRequest } = await import("../../open-sse/utils/bypassHandler.ts");

// Real Claude Code sends this exact User-Agent (see
// open-sse/services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT).
const REAL_CLAUDE_CODE_UA = "claude-cli/2.1.63 (external, cli)";

const warmupBody = { messages: [{ role: "user", content: "Warmup" }] };

test("bypassHandler: fires for the real Claude Code UA (narrow claude-cli-only semantics preserved)", () => {
  const result = handleBypassRequest(warmupBody, "gpt-4o", REAL_CLAUDE_CODE_UA);
  assert.ok(result?.success);
});

test("bypassHandler: does NOT fire for the broader Claude-Code family UA (semantics unchanged by consolidation)", () => {
  // bypassHandler's bypass patterns are Claude CLI-internal-protocol specific;
  // it must stay narrower than the canonical isClaudeCodeUserAgent detector,
  // which also matches "claude-code"/"claude_code"/"anthropic cli".
  const result = handleBypassRequest(warmupBody, "gpt-4o", "claude-code/1.0.0");
  assert.equal(result, null);
});

test("bypassHandler: does not fire for unrelated clients", () => {
  const result = handleBypassRequest(warmupBody, "gpt-4o", "curl/8.0");
  assert.equal(result, null);
});
