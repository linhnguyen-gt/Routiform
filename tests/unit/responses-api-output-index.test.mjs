import test from "node:test";
import assert from "node:assert/strict";

test("openaiToOpenAIResponsesResponse assigns distinct, sequential output_index for reasoning, message, and tool_calls", async () => {
  const { openaiToOpenAIResponsesResponse } =
    await import("../../open-sse/translator/response/openai-responses.ts");
  const { initState } = await import("../../open-sse/translator/index.ts");
  const { FORMATS } = await import("../../open-sse/translator/formats.ts");

  const state = initState(FORMATS.OPENAI_RESPONSES);

  // 1. Chunk with reasoning_content
  const chunk1 = {
    id: "test1",
    choices: [
      {
        index: 0,
        delta: { reasoning_content: "Thinking step 1" },
      },
    ],
  };
  const events1 = openaiToOpenAIResponsesResponse(chunk1, state);
  const reasoningItemAdded = events1.find((e) => e.event === "response.output_item.added");
  assert.ok(reasoningItemAdded);
  assert.equal(reasoningItemAdded.data.output_index, 0);
  assert.equal(reasoningItemAdded.data.item.type, "reasoning");

  // 2. Chunk with content text
  const chunk2 = {
    id: "test1",
    choices: [
      {
        index: 0,
        delta: { content: "Hello world" },
      },
    ],
  };
  const events2 = openaiToOpenAIResponsesResponse(chunk2, state);
  const messageItemAdded = events2.find((e) => e.event === "response.output_item.added");
  assert.ok(messageItemAdded);
  assert.equal(
    messageItemAdded.data.output_index,
    1,
    "Message output_index must be 1 after reasoning at 0"
  );
  assert.equal(messageItemAdded.data.item.type, "message");

  // 3. Chunk with tool_calls
  const chunk3 = {
    id: "test1",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
            },
          ],
        },
      },
    ],
  };
  const events3 = openaiToOpenAIResponsesResponse(chunk3, state);
  const toolItemAdded = events3.find((e) => e.event === "response.output_item.added");
  assert.ok(toolItemAdded);
  assert.equal(
    toolItemAdded.data.output_index,
    2,
    "Function call output_index must be 2 after message at 1"
  );
  assert.equal(toolItemAdded.data.item.type, "function_call");

  // 4. Finish chunk
  const chunk4 = {
    id: "test1",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "tool_calls",
      },
    ],
  };
  const events4 = openaiToOpenAIResponsesResponse(chunk4, state);
  const completedEvent = events4.find((e) => e.event === "response.completed");
  assert.ok(completedEvent);
  const output = completedEvent.data.response.output;
  assert.equal(output.length, 3);
  assert.equal(output[0].type, "reasoning");
  assert.equal(output[1].type, "message");
  assert.equal(output[2].type, "function_call");
});

test("openaiToOpenAIResponsesResponse closes reasoning output_item before message begins", async () => {
  const { openaiToOpenAIResponsesResponse } =
    await import("../../open-sse/translator/response/openai-responses.ts");
  const { initState } = await import("../../open-sse/translator/index.ts");
  const { FORMATS } = await import("../../open-sse/translator/formats.ts");

  const state = initState(FORMATS.OPENAI_RESPONSES);

  // Chunk 1: reasoning
  const chunk1 = {
    id: "test2",
    choices: [{ index: 0, delta: { reasoning_content: "Step 1" } }],
  };
  openaiToOpenAIResponsesResponse(chunk1, state);

  // Chunk 2: text starts -> reasoning should be closed in this turn before message output item is added
  const chunk2 = {
    id: "test2",
    choices: [{ index: 0, delta: { content: "Done thinking" } }],
  };
  const events2 = openaiToOpenAIResponsesResponse(chunk2, state);

  const reasoningDoneIdx = events2.findIndex(
    (e) => e.event === "response.output_item.done" && e.data.item?.type === "reasoning"
  );
  const msgAddedIdx = events2.findIndex(
    (e) => e.event === "response.output_item.added" && e.data.item?.type === "message"
  );

  assert.ok(reasoningDoneIdx !== -1, "Reasoning output_item.done must be emitted when text begins");
  assert.ok(msgAddedIdx !== -1, "Message output_item.added must be emitted");
  assert.ok(reasoningDoneIdx < msgAddedIdx, "Reasoning done must precede message added");
});
test("responsesTransformer handles sequential output indices for reasoning, text, and tools", async () => {
  const { createResponsesApiTransformStream } =
    await import("../../open-sse/transformer/responsesTransformer.ts");

  const chunks = [
    'data: {"id":"c1","choices":[{"index":0,"delta":{"reasoning_content":"Thinking..."}}]}\n\n',
    'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Answer"}}]}\n\n',
    'data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const input = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(new TextEncoder().encode(c));
      }
      controller.close();
    },
  });

  const stream = input.pipeThrough(createResponsesApiTransformStream(null));
  const allText = await new Response(stream).text();

  assert.ok(
    allText.includes(
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"rs_'
    )
  );
  assert.ok(
    allText.includes(
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":1,"item":{"id":"msg_'
    )
  );
  assert.ok(allText.includes("event: response.completed"));
});

test("estimateInputTokens calculates tokens for Responses API body with input and instructions", async () => {
  const { estimateInputTokens } = await import("../../open-sse/utils/usageTracking.ts");

  const body = {
    instructions: "You are a helpful coding assistant with extensive tools and context.",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Please read the file /tmp/test.ts and summarize it" },
        ],
      },
      {
        type: "function_call",
        call_id: "call_123",
        name: "read_file",
        arguments: '{"path":"/tmp/test.ts"}',
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: "const x = 1;\nconst y = 2;\nconsole.log(x + y);",
      },
    ],
    tools: [
      {
        type: "function",
        name: "read_file",
        description: "Read a file from disk",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  };

  const tokens = estimateInputTokens(body);
  assert.ok(tokens > 20, `Tokens should be > 20, got ${tokens}`);
});

test("createSSEStream cancel after terminal event calculates and passes finalUsage", async () => {
  const { createSSEStream, STREAM_MODE } =
    await import("../../open-sse/utils/stream/createSSEStream.ts");
  const { FORMATS } = await import("../../open-sse/translator/formats.ts");

  let completedPayload = null;
  const body = {
    input: [{ role: "user", content: [{ type: "input_text", text: "Hello" }] }],
  };

  const stream = createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat: FORMATS.OPENAI,
    sourceFormat: FORMATS.OPENAI_RESPONSES,
    body,
    onComplete: (payload) => {
      completedPayload = payload;
    },
  });

  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Send a chunk that delivers response.completed
  await writer.write(
    new TextEncoder().encode(
      'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n\n'
    )
  );
  await writer.write(
    new TextEncoder().encode(
      'data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
    )
  );

  // Read out the events
  await reader.read(); // response.created / in_progress / added
  await reader.read();
  await reader.read();

  // Client cancels stream after receiving terminal event
  await reader.cancel();

  assert.ok(completedPayload, "onComplete must be called on cancel after terminal event");
  assert.equal(completedPayload.status, 200);
  assert.ok(completedPayload.usage, "usage must be populated");
  assert.ok(
    completedPayload.usage.prompt_tokens > 0 || completedPayload.usage.input_tokens > 0,
    "prompt tokens must be > 0"
  );
  assert.ok(
    completedPayload.usage.completion_tokens > 0 || completedPayload.usage.output_tokens > 0,
    "completion tokens must be > 0"
  );
});
test("openaiToOpenAIResponsesResponse always includes usage and model in response.completed", async () => {
  const { openaiToOpenAIResponsesResponse } =
    await import("../../open-sse/translator/response/openai-responses.ts");
  const { initState } = await import("../../open-sse/translator/index.ts");
  const { FORMATS } = await import("../../open-sse/translator/formats.ts");

  const state = initState(FORMATS.OPENAI_RESPONSES);
  state.model = "ollamacloud/glm-5.3-flash";
  state.inputTokens = 1250;

  const chunk1 = {
    id: "chatcmpl-test",
    created: 1788014500,
    model: "glm-5.3-flash",
    choices: [
      {
        index: 0,
        delta: { content: "Hello world!" },
      },
    ],
  };
  openaiToOpenAIResponsesResponse(chunk1, state);

  const finishChunk = {
    id: "chatcmpl-test",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };
  const finishEvents = openaiToOpenAIResponsesResponse(finishChunk, state);
  const completed = finishEvents.find((e) => e.event === "response.completed");
  assert.ok(completed, "response.completed event must be emitted");
  assert.ok(completed.data.response.usage, "response.usage must be present");
  assert.equal(completed.data.response.usage.input_tokens, 1250);
  assert.ok(completed.data.response.usage.output_tokens > 0);
  assert.equal(
    completed.data.response.usage.total_tokens,
    completed.data.response.usage.input_tokens + completed.data.response.usage.output_tokens
  );
  assert.ok(completed.data.response.model, "response.model must be present");
});

test("getUnifiedModelsResponse returns models alias and token limits for ollamacloud models", async () => {
  const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");
  const response = await v1ModelsCatalog.getUnifiedModelsResponse(
    new Request("http://localhost/api/v1/models", { method: "GET" })
  );
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.ok(Array.isArray(json.data), "json.data must be array");
  assert.ok(Array.isArray(json.models), "json.models alias must be array for Codex CLI");
  assert.equal(json.models.length, json.data.length);

  const glm = json.data.find((m) => m.id.includes("glm") || m.id.includes("ollama"));
  if (glm) {
    assert.ok(glm.context_length > 0, "model must carry positive context_length");
    assert.ok(glm.max_output_tokens > 0, "model must carry positive max_output_tokens");
  }
});
