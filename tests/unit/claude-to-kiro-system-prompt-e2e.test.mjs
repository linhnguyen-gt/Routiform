/**
 * End-to-end regression test for the Claude Code -> Kiro system prompt path.
 *
 * Phase 03 made buildKiroPayload() consume system messages from the OpenAI-shaped
 * intermediate body and prepend them as an <instructions> block on the current
 * message content (see openai-to-kiro.ts). That fix was verified only by unit
 * tests that call buildKiroPayload() directly, bypassing translateRequest().
 *
 * The real Claude Code request path goes: claude -> openai (hub) -> kiro, all
 * inside translateRequest() (translator/index.ts). That hub step used to strip
 * every role:"system" message right after the claude->openai conversion, before
 * buildKiroPayload() ever sees them — silently dropping the system prompt for
 * the primary Kiro client (Claude Code / /v1/messages), even though the direct
 * buildKiroPayload() unit tests were green.
 *
 * These tests exercise translateRequest() end-to-end for both source formats
 * that can target Kiro, so a regression in the hub-and-spoke stripping logic
 * fails here instead of only in production traffic.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("claude source: system prompt reaches the Kiro payload via <instructions> prefix", () => {
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 64,
    system: "You are a careful senior engineer. Follow repository rules.",
    messages: [{ role: "user", content: "Hello" }],
  };

  const payload = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.KIRO,
    body.model,
    structuredClone(body),
    false,
    null,
    null,
    null
  );

  const content = payload.conversationState.currentMessage.userInputMessage.content;

  assert.equal(
    content.includes(
      "<instructions>\nYou are a careful senior engineer. Follow repository rules.\n</instructions>"
    ),
    true,
    `expected <instructions> block with the system prompt, got: ${content}`
  );
  assert.equal(content.endsWith("Hello"), true);
});

test("claude source: system prompt is not injected twice (content prefix only, no systemInstruction field)", () => {
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 64,
    system: "UNIQUE_E2E_MARKER_91c2: persona and tool rules.",
    messages: [{ role: "user", content: "List files" }],
  };

  const payload = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.KIRO,
    body.model,
    structuredClone(body),
    false,
    null,
    null,
    null
  );

  const userInputMessage = payload.conversationState.currentMessage.userInputMessage;
  const serialized = JSON.stringify(payload);
  const occurrences = serialized.split("UNIQUE_E2E_MARKER_91c2").length - 1;

  assert.equal("systemInstruction" in userInputMessage, false);
  assert.equal(occurrences, 1, `expected exactly one occurrence, got ${occurrences}`);
});

test("openai source: system message still reaches the Kiro payload via <instructions> prefix", () => {
  const body = {
    model: "claude-sonnet-4-5",
    messages: [
      { role: "system", content: "Follow repository rules" },
      { role: "user", content: "Hello" },
    ],
  };

  const payload = translateRequest(
    FORMATS.OPENAI,
    FORMATS.KIRO,
    body.model,
    structuredClone(body),
    false,
    null,
    null,
    null
  );

  const content = payload.conversationState.currentMessage.userInputMessage.content;

  assert.equal(
    content.startsWith("<instructions>\nFollow repository rules\n</instructions>\n\n"),
    true
  );
  assert.equal(content.endsWith("Hello"), true);
});
