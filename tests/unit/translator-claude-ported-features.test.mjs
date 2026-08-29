import test from "node:test";
import assert from "node:assert/strict";

test("openaiToClaudeRequest converts OpenAI PDF file and image_url to Claude document block", async () => {
  const { openaiToClaudeRequest } =
    await import("../../open-sse/translator/request/openai-to-claude.ts");

  const fakePdfBase64 = "JVBERi0xLjQKJcTl8uXrCg==";
  const pdfDataUrl = `data:application/pdf;base64,${fakePdfBase64}`;

  // 1. Test part.type === "file"
  const bodyWithFile = {
    model: "claude-3-7-sonnet",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Summarize this PDF" },
          {
            type: "file",
            file: {
              file_data: pdfDataUrl,
            },
          },
        ],
      },
    ],
  };

  const result1 = openaiToClaudeRequest("claude-3-7-sonnet", bodyWithFile, false);
  const userMsg1 = result1.messages.find((m) => m.role === "user");
  assert.ok(userMsg1);
  assert.ok(Array.isArray(userMsg1.content));

  const docBlock1 = userMsg1.content.find((b) => b.type === "document");
  assert.ok(docBlock1, "Should contain document block for type: file");
  assert.equal(docBlock1.source.type, "base64");
  assert.equal(docBlock1.source.media_type, "application/pdf");
  assert.equal(docBlock1.source.data, fakePdfBase64);

  // 2. Test part.type === "image_url" with application/pdf
  const bodyWithPdfImageUrl = {
    model: "claude-3-7-sonnet",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Read this PDF document" },
          {
            type: "image_url",
            image_url: {
              url: pdfDataUrl,
            },
          },
        ],
      },
    ],
  };

  const result2 = openaiToClaudeRequest("claude-3-7-sonnet", bodyWithPdfImageUrl, false);
  const userMsg2 = result2.messages.find((m) => m.role === "user");
  assert.ok(userMsg2);
  const docBlock2 = userMsg2.content.find((b) => b.type === "document");
  assert.ok(docBlock2, "Should contain document block for image_url with application/pdf");
  assert.equal(docBlock2.source.media_type, "application/pdf");
});

test("claudeToOpenAIResponse skips server_tool_use (web search) blocks in streaming", async () => {
  const { claudeToOpenAIResponse } =
    await import("../../open-sse/translator/response/claude-to-openai.ts");
  const { initState } = await import("../../open-sse/translator/index.ts");

  const state = initState("claude");

  // 1. message_start
  const startChunk = {
    type: "message_start",
    message: { id: "msg_123", model: "claude-3-7-sonnet" },
  };
  const res1 = claudeToOpenAIResponse(startChunk, state);
  assert.ok(res1);

  // 2. server_tool_use start (index 0) - should be skipped
  const serverToolStart = {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "server_tool_use",
      name: "web_search",
      id: "srv_tool_1",
    },
  };
  const res2 = claudeToOpenAIResponse(serverToolStart, state);
  assert.equal(res2, null, "server_tool_use start should return null");

  // 3. server_tool_use delta (index 0) - should be skipped
  const serverToolDelta = {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "input_json_delta",
      partial_json: '{"query": "weather"}',
    },
  };
  const res3 = claudeToOpenAIResponse(serverToolDelta, state);
  assert.equal(res3, null, "server_tool_use delta should return null");

  // 4. server_tool_use stop (index 0) - should be skipped
  const serverToolStop = {
    type: "content_block_stop",
    index: 0,
  };
  const res4 = claudeToOpenAIResponse(serverToolStop, state);
  assert.equal(res4, null, "server_tool_use stop should return null");

  // 5. Normal text block (index 1) - should be processed normally
  const textStart = {
    type: "content_block_start",
    index: 1,
    content_block: { type: "text", text: "" },
  };
  claudeToOpenAIResponse(textStart, state);

  const textDelta = {
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "Here is the search result." },
  };
  const res5 = claudeToOpenAIResponse(textDelta, state);
  assert.ok(res5);
  assert.equal(res5[0].choices[0].delta.content, "Here is the search result.");
});
