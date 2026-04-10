import test from "node:test";
import assert from "node:assert/strict";

const { openaiToClaudeRequest } =
  await import("../../open-sse/translator/request/openai-to-claude.ts");
const { buildClaudeCodeCompatibleRequest } =
  await import("../../open-sse/services/claudeCodeCompatible.ts");

test("openaiToClaudeRequest preserves native Claude document and citation blocks", () => {
  const result = openaiToClaudeRequest(
    "claude-sonnet-4-6",
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: "ZmFrZQ==",
              },
              title: "Spec",
              citations: { enabled: true },
            },
            {
              type: "text",
              text: "Summarize it",
              citations: [{ start: 0, end: 4, cited_text: "fake" }],
              cache_control: { type: "ephemeral" },
              unexpected: "drop-me",
            },
          ],
        },
      ],
      max_tokens: 128,
    },
    false
  );

  const content = result.messages[0].content;
  assert.equal(content[0].type, "document");
  assert.deepEqual(content[0].citations, { enabled: true });
  assert.equal(content[1].type, "text");
  assert.ok(Array.isArray(content[1].citations));
  assert.deepEqual(content[1].cache_control, { type: "ephemeral" });
  assert.equal(content[1].unexpected, undefined);
});

test("openaiToClaudeRequest preserves native assistant server tool blocks", () => {
  const result = openaiToClaudeRequest(
    "claude-sonnet-4-6",
    {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "server_tool_use",
              id: "srv_1",
              name: "web_search",
              input: { query: "routiform" },
            },
          ],
        },
      ],
      max_tokens: 128,
    },
    false
  );

  assert.equal(result.messages[0].content[0].type, "server_tool_use");
  assert.equal(result.messages[0].content[0].name, "web_search");
});

test("buildClaudeCodeCompatibleRequest keeps actionable trailing assistant blocks", () => {
  const payload = buildClaudeCodeCompatibleRequest({
    claudeBody: {
      system: [{ type: "text", text: "You are helpful" }],
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "server_tool_use",
              id: "srv_1",
              name: "web_search",
              input: { query: "routiform" },
            },
          ],
        },
      ],
      tools: [],
    },
    model: "claude-sonnet-4-6",
    sessionId: "session-docs-1",
  });

  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].role, "assistant");
  assert.equal(payload.messages[0].content[0].type, "server_tool_use");
});

test("buildClaudeCodeCompatibleRequest trims trailing plain prefill from mixed assistant tails", () => {
  const payload = buildClaudeCodeCompatibleRequest({
    claudeBody: {
      system: [{ type: "text", text: "You are helpful" }],
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "server_tool_use",
              id: "srv_1",
              name: "web_search",
              input: { query: "routiform" },
            },
            { type: "text", text: "Prefill" },
          ],
        },
      ],
      tools: [],
    },
    model: "claude-sonnet-4-6",
    sessionId: "session-docs-mixed",
  });

  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].content.length, 1);
  assert.equal(payload.messages[0].content[0].type, "server_tool_use");
});

test("buildClaudeCodeCompatibleRequest still drops plain trailing assistant prefill", () => {
  const payload = buildClaudeCodeCompatibleRequest({
    claudeBody: {
      system: [{ type: "text", text: "You are helpful" }],
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Prefill only" }],
        },
      ],
      tools: [],
    },
    model: "claude-sonnet-4-6",
    sessionId: "session-docs-2",
  });

  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].role, "user");
  assert.equal(payload.messages[0].content[0].text, "Prefill only");
});
