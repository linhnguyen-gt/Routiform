import test from "node:test";
import assert from "node:assert/strict";

const { stripEmptyTextBlocks, openaiToClaudeRequest, normalizeContentToString } =
  await import("../../open-sse/translator/request/openai-to-claude.ts");

test("stripEmptyTextBlocks removes empty text recursively inside tool_result content", () => {
  const input = [
    { type: "text", text: "" },
    { type: "text", text: "keep-top-level" },
    {
      type: "tool_result",
      content: [
        { type: "text", text: "" },
        { type: "text", text: "keep-nested" },
        {
          type: "tool_result",
          content: [
            { type: "text", text: "" },
            { type: "text", text: "keep-deep" },
          ],
        },
      ],
    },
  ];

  const out = stripEmptyTextBlocks(input);
  assert.deepEqual(out, [
    { type: "text", text: "keep-top-level" },
    {
      type: "tool_result",
      content: [
        { type: "text", text: "keep-nested" },
        {
          type: "tool_result",
          content: [{ type: "text", text: "keep-deep" }],
        },
      ],
    },
  ]);
});

test("openaiToClaudeRequest applies strip to tool message array content", () => {
  const request = {
    messages: [
      { role: "user", content: "run tool" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "demo_tool", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: [
          { type: "text", text: "" },
          { type: "text", text: "tool ok" },
        ],
      },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4", request, false);
  const toolMessage = translated.messages.find(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")
  );
  assert.ok(toolMessage, "expected a translated tool_result user message");
  const toolResult = toolMessage.content.find((b) => b.type === "tool_result");
  assert.deepEqual(toolResult.content, [{ type: "text", text: "tool ok" }]);
});

test("T15: normalizeContentToString supports array-form content blocks", () => {
  const text = normalizeContentToString([
    { type: "text", text: "line 1" },
    { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    { type: "text", text: "line 2" },
  ]);

  assert.equal(text, "line 1\nline 2");
});

test("T15: openaiToClaudeRequest converts system array content into a Claude system text block", () => {
  const request = {
    messages: [
      {
        role: "system",
        content: [
          { type: "text", text: "System rules A" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          { type: "text", text: "System rules B" },
        ],
      },
      { role: "user", content: "hello" },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4", request, false);
  assert.ok(Array.isArray(translated.system));
  // system[0] is the injected Claude prompt; user-provided system content is system[1].
  assert.equal(translated.system[1].text, "System rules A\nSystem rules B");
});

test("openaiToClaudeRequest keeps https image_url as Claude image url source", () => {
  const request = {
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
          { type: "text", text: "analyze" },
        ],
      },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4", request, false);
  const firstUser = translated.messages.find((m) => m.role === "user");
  assert.ok(firstUser);
  const imageBlock = firstUser.content.find((b) => b.type === "image");
  assert.deepEqual(imageBlock, {
    type: "image",
    source: { type: "url", url: "https://example.com/a.png" },
  });
});

test("openaiToClaudeRequest converts filesystem_read_media_file tool JSON into image tool_result", () => {
  const request = {
    messages: [
      { role: "user", content: "analyze local image" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "filesystem_read_media_file", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: JSON.stringify({ mimeType: "image/png", data: "abc123" }),
      },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4", request, false);
  const toolMessage = translated.messages.find(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")
  );
  assert.ok(toolMessage);
  const toolResult = toolMessage.content.find((b) => b.type === "tool_result");
  assert.deepEqual(toolResult.content, [
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "abc123" },
    },
  ]);
});

test("openaiToClaudeRequest skips nameless built-in responses tools", () => {
  const request = {
    messages: [{ role: "user", content: "use tools" }],
    tools: [
      { type: "web_search", external_web_access: true },
      { type: "function", function: { name: "get_weather", parameters: { type: "object" } } },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4", request, false);
  assert.ok(Array.isArray(translated.tools));
  assert.equal(translated.tools.length, 1);
  assert.equal(translated.tools[0].name.includes("undefined"), false);
  assert.equal(translated.tools[0].name.includes("get_weather"), true);
});

test("openaiToClaudeRequest maps every reasoning_effort level to a thinking budget", () => {
  const expected = { low: 1024, medium: 10240, high: 131072, xhigh: 131072, max: 131072 };
  for (const [effort, budget] of Object.entries(expected)) {
    const translated = openaiToClaudeRequest(
      "claude-sonnet-4",
      { messages: [{ role: "user", content: "hi" }], reasoning_effort: effort },
      false
    );
    assert.deepEqual(
      translated.thinking,
      { type: "enabled", budget_tokens: budget },
      `reasoning_effort=${effort} should map to budget_tokens=${budget}`
    );
    assert.ok(
      translated.max_tokens > budget,
      `max_tokens (${translated.max_tokens}) must exceed budget_tokens (${budget}) for ${effort}`
    );
  }
});

test("thinking from reasoning_effort forces temperature to 1 (Anthropic requirement)", () => {
  const translated = openaiToClaudeRequest(
    "claude-sonnet-4",
    { messages: [{ role: "user", content: "hi" }], reasoning_effort: "high", temperature: 0.7 },
    false
  );
  assert.equal(translated.thinking.type, "enabled");
  assert.equal(translated.temperature, 1);
});

test("temperature is untouched when thinking is not enabled", () => {
  const translated = openaiToClaudeRequest(
    "claude-sonnet-4",
    { messages: [{ role: "user", content: "hi" }], temperature: 0.7 },
    false
  );
  assert.equal(translated.thinking, undefined);
  assert.equal(translated.temperature, 0.7);
});
