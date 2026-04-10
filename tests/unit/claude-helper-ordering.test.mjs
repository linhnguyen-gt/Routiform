import test from "node:test";
import assert from "node:assert/strict";

const { hasValidContent, fixToolUseOrdering, prepareClaudeRequest } =
  await import("../../open-sse/translator/helpers/claudeHelper.ts");

test("hasValidContent accepts Claude native document and assistant runtime blocks", () => {
  assert.equal(
    hasValidContent({
      role: "user",
      content: [{ type: "document", title: "Spec", source: { type: "text", text: "Hello" } }],
    }),
    true
  );

  assert.equal(
    hasValidContent({
      role: "assistant",
      content: [{ type: "server_tool_use", id: "srv_1", name: "web_search", input: {} }],
    }),
    true
  );
});

test("fixToolUseOrdering trims trailing text after native assistant action blocks", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Working" },
        { type: "server_tool_use", id: "srv_1", name: "web_search", input: { q: "x" } },
        { type: "text", text: "drop me" },
      ],
    },
  ];

  const [message] = fixToolUseOrdering(structuredClone(messages));
  assert.deepEqual(message.content, [
    { type: "text", text: "Working" },
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { q: "x" } },
  ]);
});

test("fixToolUseOrdering preserves native result order after assistant action blocks", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Working" },
        { type: "server_tool_use", id: "srv_1", name: "web_search", input: { q: "x" } },
      ],
    },
    {
      role: "assistant",
      content: [{ type: "web_search_tool_result", tool_use_id: "srv_1", content: [] }],
    },
  ];

  const [message] = fixToolUseOrdering(structuredClone(messages));
  assert.deepEqual(message.content, [
    { type: "text", text: "Working" },
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { q: "x" } },
    { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] },
  ]);
});

test("prepareClaudeRequest keeps native assistant action messages in non-final turns", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [{ type: "server_tool_use", id: "srv_1", name: "web_search", input: {} }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Continue" }],
      },
    ],
  };

  const result = prepareClaudeRequest(structuredClone(body), "claude", true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].content[0].type, "server_tool_use");
});

test("prepareClaudeRequest does not reintroduce assistant text after native action merge", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Working" },
          { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "drop me" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Continue" }],
      },
    ],
  };

  const result = prepareClaudeRequest(structuredClone(body), "claude", true);
  assert.deepEqual(result.messages[0].content, [
    { type: "text", text: "Working" },
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} },
  ]);
});
