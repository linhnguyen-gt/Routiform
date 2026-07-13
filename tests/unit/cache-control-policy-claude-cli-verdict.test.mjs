import test from "node:test";
import assert from "node:assert/strict";

import {
  isClaudeCodeClient,
  shouldPreserveCacheControl,
} from "../../open-sse/utils/cacheControlPolicy.ts";
import { buildClaudeCodeCompatibleRequest } from "../../open-sse/services/claudeCodeCompatible.ts";
import {
  enforceCacheControlLimit,
  ensureCacheControlOnLastUserMessage,
} from "../../open-sse/services/claudeCodeConstraints.ts";

// Real Claude Code sends this exact User-Agent (see
// open-sse/services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT
// and the working-in-production bypass gate in open-sse/utils/bypassHandler.ts).
const REAL_CLAUDE_CODE_UA = "claude-cli/2.1.63 (external, cli)";
const LEGACY_CLAUDE_CODE_UA = "Claude-Code/1.0.0";

function countCacheControlBlocks(body) {
  let n = 0;
  for (const block of body.system || []) if (block.cache_control) n++;
  for (const msg of body.messages || []) {
    for (const block of Array.isArray(msg.content) ? msg.content : []) {
      if (block.cache_control) n++;
    }
  }
  for (const tool of body.tools || []) if (tool.cache_control) n++;
  return n;
}

test("cacheControlPolicy.isClaudeCodeClient: deliberately left unfixed for claude-cli (Fix 2 verdict = do not apply)", () => {
  // See tests below for the concrete regression this gap is protecting
  // against: naively adding "claude-cli" here would flip
  // shouldPreserveCacheControl to true for every real Claude Code request
  // routed through a Claude-Code-compatible bridge target, which can push
  // the total cache_control breakpoint count above Anthropic's hard cap of 4.
  assert.equal(isClaudeCodeClient(REAL_CLAUDE_CODE_UA), false);
  assert.equal(isClaudeCodeClient(LEGACY_CLAUDE_CODE_UA), true);
});

test("shouldPreserveCacheControl: real Claude Code UA does not yet trigger preservation (documents current, intentional gap)", () => {
  assert.equal(
    shouldPreserveCacheControl({
      userAgent: REAL_CLAUDE_CODE_UA,
      isCombo: false,
      targetProvider: "claude",
      targetFormat: "claude",
    }),
    false
  );
});

test("LANDMINE: preserveCacheControl=true on the Claude-Code-compatible bridge can exceed Anthropic's 4-breakpoint cap", () => {
  // Simulates real Claude Code sending its own 4 deliberate cache_control
  // breakpoints (system prompt, 2nd-to-last user turn, an assistant turn,
  // last user turn) through buildClaudeCodeCompatibleRequest with
  // preserveCacheControl=true — i.e. what would happen automatically for
  // EVERY real Claude Code request if cacheControlPolicy's detection were
  // naively fixed to recognise claude-cli.
  const claudeBody = {
    system: [{ type: "text", text: "you are claude code", cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "turn1" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "reply1", cache_control: { type: "ephemeral" } }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "turn2", cache_control: { type: "ephemeral" } }],
      },
      { role: "assistant", content: [{ type: "text", text: "reply2" }] },
      {
        role: "user",
        content: [{ type: "text", text: "turn3 (last)", cache_control: { type: "ephemeral" } }],
      },
    ],
  };

  const built = buildClaudeCodeCompatibleRequest({
    claudeBody,
    normalizedBody: { messages: claudeBody.messages },
    model: "claude-sonnet-4-5",
    preserveCacheControl: true,
  });

  // buildAndSignClaudeCodeRequest's real pipeline order: cap first, THEN
  // unconditionally (re-)inject a marker on the last user message.
  enforceCacheControlLimit(built);
  const afterLimit = countCacheControlBlocks(built);
  ensureCacheControlOnLastUserMessage(built);
  const afterEnsure = countCacheControlBlocks(built);

  assert.ok(afterLimit <= 4, `enforceCacheControlLimit should cap at 4, got ${afterLimit}`);
  // This is the bug: ensureCacheControlOnLastUserMessage runs AFTER the cap
  // and unconditionally adds a marker if the last user turn's own marker was
  // among the ones stripped by the cap, pushing the total back over 4.
  assert.equal(
    afterEnsure,
    5,
    "documents the discovered ordering bug in claudeCodeConstraints.ts — NOT introduced by this change, " +
      "but only reachable in practice once cacheControlPolicy preserves client cache_control for claude-cli"
  );
});

test("control: preserveCacheControl=false (today's actual production behavior) never approaches the cap", () => {
  const claudeBody = {
    system: [{ type: "text", text: "you are claude code", cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "turn1" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "reply1", cache_control: { type: "ephemeral" } }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "turn2", cache_control: { type: "ephemeral" } }],
      },
      { role: "assistant", content: [{ type: "text", text: "reply2" }] },
      {
        role: "user",
        content: [{ type: "text", text: "turn3 (last)", cache_control: { type: "ephemeral" } }],
      },
    ],
  };

  const built = buildClaudeCodeCompatibleRequest({
    claudeBody,
    normalizedBody: { messages: claudeBody.messages },
    model: "claude-sonnet-4-5",
    preserveCacheControl: false,
  });

  enforceCacheControlLimit(built);
  ensureCacheControlOnLastUserMessage(built);

  assert.ok(countCacheControlBlocks(built) <= 4);
});
