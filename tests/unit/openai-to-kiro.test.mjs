import test from "node:test";
import assert from "node:assert/strict";

const { buildKiroPayload } = await import("../../open-sse/translator/request/openai-to-kiro.ts");

test("buildKiroPayload moves the last user turn into currentMessage and keeps tools there", () => {
  const body = {
    messages: [
      { role: "system", content: "Follow repository rules" },
      { role: "user", content: "First request" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second request" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);

  assert.equal(
    payload.conversationState.currentMessage.userInputMessage.modelId,
    "claude-sonnet-4.5"
  );
  assert.equal(
    payload.conversationState.currentMessage.userInputMessage.userInputMessageContext.tools.length,
    1
  );
  assert.equal(
    payload.conversationState.currentMessage.userInputMessage.content.includes("Second request"),
    true
  );
  assert.equal(
    payload.conversationState.history.some(
      (item) => item.userInputMessage?.userInputMessageContext?.tools
    ),
    false
  );
});

test("buildKiroPayload converts tool calls and tool results into adjacent Kiro turns", () => {
  const body = {
    messages: [
      { role: "user", content: "Run diagnostics" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"pwd"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "/tmp/project" },
      { role: "user", content: "Continue" },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const assistantTurn = payload.conversationState.history.find(
    (item) => item.assistantResponseMessage
  );
  const toolResultTurn = payload.conversationState.currentMessage;

  assert.ok(assistantTurn?.assistantResponseMessage);
  assert.equal(assistantTurn.assistantResponseMessage.content, "...");
  assert.equal(assistantTurn.assistantResponseMessage.toolUses[0].name, "bash");
  assert.deepEqual(assistantTurn.assistantResponseMessage.toolUses[0].input, { command: "pwd" });
  assert.ok(toolResultTurn?.userInputMessage);
  assert.equal(
    toolResultTurn.userInputMessage.userInputMessageContext.toolResults[0].toolUseId,
    "call_1"
  );
  assert.equal(
    toolResultTurn.userInputMessage.userInputMessageContext.toolResults[0].content[0].text,
    "/tmp/project"
  );
});

test("buildKiroPayload degrades remote images to text and keeps base64 images as Kiro images", () => {
  // Do not "fix" this back to asserting current.images === undefined.
  //
  // That is what it said between 5927d0da9 (a typing refactor) and 2026-07-13. The refactor
  // rebuilt currentMessage.userInputMessage field by field and silently stopped copying
  // `images`, and this test was rewritten in the same commit to bless the new behavior —
  // its name even changed from "keeps base64 images" to "omits current-turn image bytes".
  // The result shipped: an attached image did not reach the model until the turn AFTER it
  // was sent, once it had aged into history. Kiro does accept images (see the images field
  // on userInputMessage); dropping them was never the intent.
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
          { type: "text", text: "Inspect both" },
        ],
      },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const current = payload.conversationState.currentMessage.userInputMessage;

  assert.equal(current.images.length, 1);
  assert.deepEqual(current.images[0], { format: "png", source: { bytes: "abc123" } });
  // Kiro takes base64 only, so a remote URL is degraded to text rather than fetched.
  assert.equal(current.content.includes("[Image: https://example.com/a.png]"), true);
});

test("buildKiroPayload normalizes empty tool schemas and preserves provider profileArn", () => {
  const body = {
    messages: [{ role: "user", content: "Use fallback schema" }],
    tools: [{ function: { name: "search_docs" } }],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, {
    providerSpecificData: { profileArn: "arn:aws:bedrock:example" },
  });

  assert.equal(payload.profileArn, "arn:aws:bedrock:example");
  assert.deepEqual(
    payload.conversationState.currentMessage.userInputMessage.userInputMessageContext.tools[0]
      .toolSpecification.inputSchema.json,
    { type: "object", properties: {}, required: [] }
  );
});

test("buildKiroPayload keeps media tool result payloads as tool result text", () => {
  const body = {
    messages: [
      { role: "user", content: "Compare screenshot with implementation" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_img",
            type: "function",
            function: {
              name: "filesystem_read_media_file",
              arguments: '{"path":"/tmp/design.png"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_img",
        content: JSON.stringify({ mimeType: "image/png", data: "abc123" }),
      },
      { role: "user", content: "What's different?" },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const current = payload.conversationState.currentMessage.userInputMessage;

  assert.equal(current.images, undefined);
  assert.equal(
    current.userInputMessageContext.toolResults[0].content[0].text,
    body.messages[2].content
  );
});

test("buildKiroPayload keeps leading assistant/tool fragments", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_early",
            name: "read",
            input: { filePath: "/tmp/a.ts", offset: 1, limit: 50 },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_early",
        content: "orphan result",
      },
      {
        role: "user",
        content: "Continue with this task",
      },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const history = payload.conversationState.history;

  assert.equal(
    history.some((item) => Boolean(item.assistantResponseMessage)),
    true,
    "Leading assistant/tool fragments should remain in Kiro history"
  );
  assert.equal(
    payload.conversationState.currentMessage.userInputMessage.content.includes(
      "Continue with this task"
    ),
    true
  );
});

test("buildKiroPayload does not truncate tool descriptions (delegated to Kiro API)", () => {
  const veryLongDescription = "d".repeat(6000);
  const body = {
    messages: [{ role: "user", content: "Run tool" }],
    tools: [
      {
        type: "function",
        function: {
          name: "task",
          description: veryLongDescription,
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const description =
    payload.conversationState.currentMessage.userInputMessage.userInputMessageContext.tools[0]
      .toolSpecification.description;

  // Description is passed through as-is — size enforcement delegated to Kiro API
  assert.equal(description, veryLongDescription);
});

test("buildKiroPayload passes oversized history through (size enforcement delegated to Kiro API)", () => {
  const messages = [];
  for (let i = 0; i < 140; i += 1) {
    messages.push({ role: "user", content: `U${i} ${"u".repeat(1600)}` });
    messages.push({ role: "assistant", content: `A${i} ${"a".repeat(1600)}` });
  }
  messages.push({ role: "user", content: "latest request" });

  const payload = buildKiroPayload(
    "claude-sonnet-4.5",
    {
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "task",
            description: "Task tool",
            parameters: { type: "object", properties: { prompt: { type: "string" } } },
          },
        },
      ],
    },
    true,
    null
  );

  // History is passed through as-is — payload size enforcement delegated to Kiro API
  // to avoid silent context truncation in Passthrough mode
  assert.ok(payload.conversationState.history.length > 0, "History should be preserved");
});
