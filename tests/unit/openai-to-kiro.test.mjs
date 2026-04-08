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
