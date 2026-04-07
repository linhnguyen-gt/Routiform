import test from "node:test";
import assert from "node:assert/strict";

const { shouldBridgeGithubClaudeOpenAiThroughClaudeFormat } =
  await import("../../open-sse/handlers/chatCore.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("bridge: github + OpenAI→OpenAI + claude-haiku → true", () => {
  assert.equal(
    shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
      "github",
      FORMATS.OPENAI,
      FORMATS.OPENAI,
      "claude-haiku-4.5"
    ),
    true
  );
});

test("bridge: not github → false", () => {
  assert.equal(
    shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
      "anthropic",
      FORMATS.OPENAI,
      FORMATS.OPENAI,
      "claude-haiku-4.5"
    ),
    false
  );
});

test("bridge: claude-*-codex segment → false (Responses / native path)", () => {
  assert.equal(
    shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
      "github",
      FORMATS.OPENAI,
      FORMATS.OPENAI,
      "claude-5-codex-max"
    ),
    false
  );
});

test("bridge: Messages client (claude→openai) → false", () => {
  assert.equal(
    shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
      "github",
      FORMATS.CLAUDE,
      FORMATS.OPENAI,
      "claude-haiku-4.5"
    ),
    false
  );
});
