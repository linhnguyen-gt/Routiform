import test from "node:test";
import assert from "node:assert/strict";

const { convertResponsesApiFormat } =
  await import("../../open-sse/translator/helpers/responsesApiHelper.ts");
const { openaiResponsesToOpenAIRequest, openaiToOpenAIResponsesRequest } =
  await import("../../open-sse/translator/request/openai-responses.ts");
const { generateToolCallId, generateToolUseId, generateToolCallId9 } =
  await import("../../open-sse/translator/helpers/toolCallHelper.ts");

test("convertResponsesApiFormat filters orphaned function_call_output items", () => {
  const body = {
    model: "gpt-4",
    input: [
      {
        type: "function_call_output",
        call_id: "orphaned_call",
        output: "result",
      },
    ],
  };
  const result = convertResponsesApiFormat(body);
  const toolMsgs = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 0);
});

test("convertResponsesApiFormat skips function_call items with empty names", () => {
  const body = {
    model: "gpt-4",
    input: [
      { type: "function_call", call_id: "c1", name: "", arguments: "{}" },
      { type: "function_call", call_id: "c2", name: "  ", arguments: "{}" },
    ],
  };
  const result = convertResponsesApiFormat(body);
  const assistantMsgs = result.messages.filter((m) => m.role === "assistant");
  assert.equal(assistantMsgs.length, 0);
});

test("Responses→Chat: input_image converted to image_url with detail", () => {
  const body = {
    model: "gpt-4",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "What is this?" },
          { type: "input_image", image_url: "https://example.com/img.png", detail: "high" },
        ],
      },
    ],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  const userMsg = result.messages.find((m) => m.role === "user");
  const imgPart = userMsg.content.find((c) => c.type === "image_url");
  assert.ok(imgPart, "should have image_url content part");
  assert.equal(imgPart.image_url.url, "https://example.com/img.png");
  assert.equal(imgPart.image_url.detail, "high");
});

test("Responses→Chat: input_image without detail omits detail field", () => {
  const body = {
    model: "gpt-4",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_image", image_url: "https://example.com/img.png" }],
      },
    ],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  const userMsg = result.messages.find((m) => m.role === "user");
  const imgPart = userMsg.content.find((c) => c.type === "image_url");
  assert.ok(imgPart);
  assert.equal(imgPart.image_url.url, "https://example.com/img.png");
  assert.equal(imgPart.image_url.detail, undefined);
});

test("Chat→Responses: image_url detail preserved as input_image", () => {
  const body = {
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe" },
          { type: "image_url", image_url: { url: "https://example.com/img.png", detail: "low" } },
        ],
      },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const userItem = result.input.find((i) => i.type === "message" && i.role === "user");
  const imgPart = userItem.content.find((c) => c.type === "input_image");
  assert.ok(imgPart, "should have input_image content part");
  assert.equal(imgPart.image_url, "https://example.com/img.png");
  assert.equal(imgPart.detail, "low");
});

test("Chat→Responses: image_url without detail omits detail", () => {
  const body = {
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://example.com/img.png" } }],
      },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const userItem = result.input.find((i) => i.type === "message" && i.role === "user");
  const imgPart = userItem.content.find((c) => c.type === "input_image");
  assert.ok(imgPart);
  assert.equal(imgPart.detail, undefined);
});

test("Responses→Chat: input_file converted to file content part", () => {
  const body = {
    model: "gpt-4",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_file", file_id: "file-abc", filename: "data.csv" }],
      },
    ],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  const userMsg = result.messages.find((m) => m.role === "user");
  const filePart = userMsg.content.find((c) => c.type === "file");
  assert.ok(filePart, "should have file content part");
  assert.equal(filePart.file.file_id, "file-abc");
  assert.equal(filePart.file.filename, "data.csv");
});

test("Chat→Responses: file content part converted to input_file", () => {
  const body = {
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: [{ type: "file", file: { file_id: "file-abc", filename: "data.csv" } }],
      },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const userItem = result.input.find((i) => i.type === "message" && i.role === "user");
  const filePart = userItem.content.find((c) => c.type === "input_file");
  assert.ok(filePart, "should have input_file content part");
  assert.equal(filePart.file_id, "file-abc");
  assert.equal(filePart.filename, "data.csv");
});

test("Responses→Chat: tool_choice {type:'function', name} wrapped to {type:'function', function:{name}}", () => {
  const body = {
    model: "gpt-4",
    input: "hello",
    tool_choice: { type: "function", name: "get_weather" },
    tools: [{ type: "function", name: "get_weather", parameters: {} }],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.deepEqual(result.tool_choice, {
    type: "function",
    function: { name: "get_weather" },
  });
});

test("Chat→Responses: tool_choice {type:'function', function:{name}} unwrapped to {type:'function', name}", () => {
  const body = {
    model: "gpt-4",
    messages: [{ role: "user", content: "hello" }],
    tool_choice: { type: "function", function: { name: "get_weather" } },
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  assert.deepEqual(result.tool_choice, {
    type: "function",
    name: "get_weather",
  });
});

test("Responses→Chat: string tool_choice passes through unchanged", () => {
  const body = { model: "gpt-4", input: "hello", tool_choice: "auto" };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tool_choice, "auto");
});

test("Chat→Responses: string tool_choice passes through unchanged", () => {
  const body = {
    model: "gpt-4",
    messages: [{ role: "user", content: "hello" }],
    tool_choice: "required",
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  assert.equal(result.tool_choice, "required");
});

test("Responses→Chat: built-in tool_choice type degrades to auto", () => {
  const body = {
    model: "gpt-4",
    input: "hello",
    tool_choice: { type: "web_search_preview" },
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tool_choice, "auto");
});

test("Responses→Chat: web_search tool type is stripped on Chat translation", () => {
  const body = {
    model: "gpt-4",
    input: "search for cats",
    tools: [
      { type: "web_search", search_context_size: "medium" },
      { type: "function", name: "shell", parameters: { type: "object" } },
    ],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].function.name, "shell");
});

test("Responses→Chat: computer tool type is stripped on Chat translation", () => {
  const body = {
    model: "gpt-4",
    input: "click button",
    tools: [{ type: "computer" }],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tools, undefined);
});

test("Responses→Chat: mcp tool type is stripped on Chat translation", () => {
  const body = {
    model: "gpt-4",
    input: "hello",
    tools: [{ type: "mcp", server_label: "test", server_url: "https://example.com" }],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tools, undefined);
});

test("Responses→Chat: non-string arguments are JSON-stringified", () => {
  const body = {
    model: "gpt-4",
    input: [
      { type: "function_call", call_id: "c1", name: "fn", arguments: { key: "val" } },
      { type: "function_call_output", call_id: "c1", output: "ok" },
    ],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  const assistantMsg = result.messages.find((m) => m.role === "assistant");
  assert.equal(typeof assistantMsg.tool_calls[0].function.arguments, "string");
  assert.equal(assistantMsg.tool_calls[0].function.arguments, '{"key":"val"}');
});

test("Chat→Responses: array tool content converts text→input_text types", () => {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "fn", arguments: "{}" } }],
      },
      {
        role: "tool",
        tool_call_id: "c1",
        content: [{ type: "text", text: "result data" }],
      },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const outputItem = result.input.find((i) => i.type === "function_call_output");
  assert.ok(Array.isArray(outputItem.output), "output should be array");
  assert.equal(outputItem.output[0].type, "input_text");
  assert.equal(outputItem.output[0].text, "result data");
});

test("Responses→Chat: function tool type passes through", () => {
  const body = {
    model: "gpt-4",
    input: "hello",
    tools: [{ type: "function", name: "greet", parameters: {} }],
  };
  const result = openaiResponsesToOpenAIRequest(null, body, null, null);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].type, "function");
});

test("Chat→Responses: deprecated function_call field on assistant converted to function_call item", () => {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: null,
        function_call: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const fcItem = result.input.find((i) => i.type === "function_call");
  assert.ok(fcItem, "should have function_call input item");
  assert.equal(fcItem.name, "get_weather");
  assert.equal(fcItem.arguments, '{"city":"NYC"}');
  assert.ok(fcItem.call_id, "should have a call_id");
});

test("Chat→Responses: deprecated function role message converted to function_call_output", () => {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: null,
        function_call: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
      { role: "function", name: "get_weather", content: '{"temp":72}' },
    ],
  };
  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const fcOutput = result.input.find((i) => i.type === "function_call_output");
  assert.ok(fcOutput, "should have function_call_output item");
  assert.equal(fcOutput.output, '{"temp":72}');
  // The call_ids should match between function_call and function_call_output
  const fcItem = result.input.find((i) => i.type === "function_call");
  assert.equal(fcOutput.call_id, fcItem.call_id);
});

test("toolCallHelper generates deterministic ids from the same seed", () => {
  const seed = { source: "unit", index: 1, name: "search", arguments: '{"q":"x"}' };
  assert.equal(generateToolCallId(seed), generateToolCallId(seed));
  assert.equal(generateToolUseId(seed), generateToolUseId(seed));
  assert.equal(generateToolCallId9(seed), generateToolCallId9(seed));
  assert.match(generateToolCallId(seed), /^call_[a-f0-9]{16}$/);
  assert.match(generateToolUseId(seed), /^toolu_[a-f0-9]{16}$/);
  assert.match(generateToolCallId9(seed), /^[a-zA-Z0-9]{9}$/);
});

test("Chat→Responses assigns deterministic fallback call_id for assistant tool_calls", () => {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ],
  };

  const resultA = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const resultB = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const callA = resultA.input.find((i) => i.type === "function_call");
  const callB = resultB.input.find((i) => i.type === "function_call");

  assert.ok(callA?.call_id);
  assert.equal(callA.call_id, callB.call_id);
  assert.match(callA.call_id, /^call_[a-f0-9]{16}$/);
});

test("Chat→Responses deprecated function_call fallback is deterministic and unique per message", () => {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "weather twice" },
      {
        role: "assistant",
        content: null,
        function_call: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
      { role: "tool", tool_call_id: "ignored", content: '{"temp":72}' },
      {
        role: "assistant",
        content: null,
        function_call: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
    ],
  };

  const result = openaiToOpenAIResponsesRequest("gpt-4", body, true, null);
  const calls = result.input.filter((i) => i.type === "function_call");

  assert.equal(calls.length, 2);
  assert.match(calls[0].call_id, /^call_[a-f0-9]{16}$/);
  assert.match(calls[1].call_id, /^call_[a-f0-9]{16}$/);
  assert.notEqual(calls[0].call_id, calls[1].call_id);
});

const { openaiToOpenAIResponsesResponse, openaiResponsesToOpenAIResponse } =
  await import("../../open-sse/translator/response/openai-responses.ts");
const { initState } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("Chat→Responses streaming: usage-only chunk is captured (not dropped)", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);

  // First chunk with content
  const chunk1 = {
    choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
    id: "c1",
  };
  openaiToOpenAIResponsesResponse(chunk1, state);

  // Usage-only chunk (empty choices, has usage)
  const usageChunk = {
    choices: [],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
  const usageEvents = openaiToOpenAIResponsesResponse(usageChunk, state);
  assert.ok(Array.isArray(usageEvents));

  // Finish chunk
  const finishChunk = { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
  const finishEvents = openaiToOpenAIResponsesResponse(finishChunk, state);
  const completedEvent = finishEvents.find((e) => e.event === "response.completed");
  assert.ok(completedEvent, "should have completed event");
  assert.ok(completedEvent.data.response.usage, "completed event should include usage");
  assert.equal(completedEvent.data.response.usage.input_tokens, 10);
  assert.equal(completedEvent.data.response.usage.output_tokens, 5);
  assert.equal(completedEvent.data.response.usage.total_tokens, 15);
});

test("Chat→Responses streaming: copies DeepSeek reasoning_tokens onto output_tokens_details", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);
  openaiToOpenAIResponsesResponse(
    { choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }], id: "c1" },
    state
  );
  openaiToOpenAIResponsesResponse(
    {
      choices: [],
      usage: {
        prompt_tokens: 32028,
        completion_tokens: 155,
        total_tokens: 32183,
        prompt_tokens_details: { cached_tokens: 31232 },
        completion_tokens_details: { reasoning_tokens: 81 },
      },
    },
    state
  );
  const finishEvents = openaiToOpenAIResponsesResponse(
    { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    state
  );
  const completedEvent = finishEvents.find((e) => e.event === "response.completed");
  assert.ok(completedEvent);
  assert.equal(completedEvent.data.response.usage.input_tokens, 32028);
  assert.equal(completedEvent.data.response.usage.input_tokens_details.cached_tokens, 31232);
  assert.equal(completedEvent.data.response.usage.output_tokens_details.reasoning_tokens, 81);
});

test("Chat→Responses streaming: completed event includes accumulated output", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);

  // Text content
  const chunk = {
    choices: [{ index: 0, delta: { content: "hello world" }, finish_reason: null }],
    id: "c1",
  };
  openaiToOpenAIResponsesResponse(chunk, state);

  // Finish
  const finishChunk = { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
  const events = openaiToOpenAIResponsesResponse(finishChunk, state);
  const completedEvent = events.find((e) => e.event === "response.completed");
  assert.ok(completedEvent.data.response.output, "completed should have output");
  assert.ok(completedEvent.data.response.output.length > 0, "output should not be empty");
  const msgOutput = completedEvent.data.response.output.find((o) => o.type === "message");
  assert.ok(msgOutput, "should have message output item");
});

test("Responses completion usage does not double-count cached prompt tokens", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);
  const result = openaiResponsesToOpenAIResponse(
    {
      type: "response.completed",
      response: {
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          cache_read_input_tokens: 15,
          cache_creation_input_tokens: 5,
          output_tokens_details: {
            reasoning_tokens: 6,
          },
        },
      },
    },
    state
  );

  assert.ok(result);
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: {
      cached_tokens: 15,
      cache_creation_tokens: 5,
    },
    completion_tokens_details: {
      reasoning_tokens: 6,
    },
  });
  assert.deepEqual(state.usage, result.usage);
});

test("Responses completion usage preserves nested-only cache details", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);
  const result = openaiResponsesToOpenAIResponse(
    {
      type: "response.completed",
      response: {
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: {
            cached_tokens: 15,
            cache_creation_tokens: 5,
          },
          output_tokens_details: {
            reasoning_tokens: 6,
          },
        },
      },
    },
    state
  );

  assert.ok(result);
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: {
      cached_tokens: 15,
      cache_creation_tokens: 5,
    },
    completion_tokens_details: {
      reasoning_tokens: 6,
    },
  });
  assert.deepEqual(state.usage, result.usage);
});

test("Responses→Chat streaming: reasoning delta emits reasoning_content in Chat chunk", () => {
  const state = {
    started: false,
    chatId: null,
    created: null,
    toolCallIndex: 0,
    finishReasonSent: false,
  };

  const chunk = {
    type: "response.reasoning_summary_text.delta",
    delta: "thinking step...",
    item_id: "rs_1",
    output_index: 0,
    summary_index: 0,
  };
  const result = openaiResponsesToOpenAIResponse(chunk, state);
  assert.ok(result, "should return a chunk");
  assert.equal(result.choices[0].delta.reasoning_content, "thinking step...");
});

test("Chat→Responses streaming: multiple <think> tags in one chunk handled", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);

  // Chunk with multiple think tags
  const chunk = {
    choices: [
      {
        index: 0,
        delta: { content: "<think>first</think>middle<think>second</think>end" },
        finish_reason: null,
      },
    ],
    id: "c1",
  };
  const events = openaiToOpenAIResponsesResponse(chunk, state);
  // Should not have literal <think> in any text delta
  const textDeltas = events
    .filter((e) => e.event === "response.output_text.delta")
    .map((e) => e.data.delta);
  const combined = textDeltas.join("");
  assert.ok(!combined.includes("<think>"), `text should not contain <think> tag, got: ${combined}`);
});

test("Chat→Responses: merge multiple system messages into instructions", () => {
  const out = openaiToOpenAIResponsesRequest(
    "claude-haiku-4.5",
    {
      messages: [
        { role: "system", content: "First system" },
        { role: "system", content: "Second system" },
        { role: "user", content: "hi" },
      ],
    },
    true,
    null
  );
  assert.match(String(out.instructions), /First system/);
  assert.match(String(out.instructions), /Second system/);
});

test("Chat→Responses: assistant with empty content + tool_calls gets minimal output_text before function_call", () => {
  const out = openaiToOpenAIResponsesRequest(
    "claude-haiku-4.5",
    {
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: "",
          reasoning_content: "long thinking not sent to API",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read", arguments: "{}" },
            },
          ],
        },
      ],
    },
    true,
    null
  );
  const input = out.input;
  const msgIdx = input.findIndex(
    (i) => i.type === "message" && i.role === "assistant" && Array.isArray(i.content)
  );
  assert.ok(msgIdx >= 0, "assistant message should exist before tool calls");
  const afterMsg = input.slice(msgIdx);
  const fcIdx = afterMsg.findIndex((i) => i.type === "function_call");
  assert.ok(fcIdx > 0, "function_call should follow assistant message");
  assert.equal(afterMsg[0].content[0].type, "output_text");
  assert.equal(afterMsg[0].content[0].text, "\u200b");
});

test("Chat→Responses: Codex keeps terminal tool output as final input item", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.3-codex",
    {
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: "working",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "edit", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "Could not find oldString" },
      ],
    },
    true,
    null
  );

  const last = out.input[out.input.length - 1];
  assert.equal(last.type, "function_call_output");
  assert.equal(last.call_id, "call_1");
  assert.equal(last.output, "Could not find oldString");
});

test("Chat→Responses: non-Codex models do not get continuation cue", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-4.1",
    {
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: "working",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "edit", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "Could not find oldString" },
      ],
    },
    true,
    null
  );

  const last = out.input[out.input.length - 1];
  assert.notEqual(last.type, "message");
});

test("Chat→Responses: Codex does not auto-inject tool_choice required", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.3-codex",
    {
      tools: [{ type: "function", function: { name: "read", parameters: {} } }],
      messages: [
        { role: "user", content: "start" },
        {
          role: "assistant",
          content: "checking",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "result" },
        { role: "user", content: "sua di" },
      ],
    },
    true,
    null
  );

  assert.equal(out.tool_choice, undefined);
});

test("Chat→Responses: Codex keeps explicit tool_choice when provided", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.3-codex",
    {
      tools: [{ type: "function", function: { name: "read", parameters: {} } }],
      tool_choice: "auto",
      messages: [
        { role: "user", content: "start" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "result" },
      ],
    },
    true,
    null
  );

  assert.equal(out.tool_choice, "auto");
});

test("Chat→Responses: maps max_tokens to max_output_tokens", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.1-codex",
    {
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 512,
    },
    true,
    null
  );

  assert.equal(out.max_output_tokens, 512);
  assert.equal(out.max_tokens, undefined);
  assert.equal(out.max_completion_tokens, undefined);
});

test("Chat→Responses: max_completion_tokens overrides max_tokens", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.1-codex",
    {
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 256,
      max_completion_tokens: 1024,
    },
    true,
    null
  );

  assert.equal(out.max_output_tokens, 1024);
  assert.equal(out.max_tokens, undefined);
  assert.equal(out.max_completion_tokens, undefined);
});

test("Chat→Responses: preserves explicit max_output_tokens", () => {
  const out = openaiToOpenAIResponsesRequest(
    "gpt-5.1-codex",
    {
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 256,
      max_completion_tokens: 1024,
      max_output_tokens: 2048,
    },
    true,
    null
  );

  assert.equal(out.max_output_tokens, 2048);
  assert.equal(out.max_tokens, undefined);
  assert.equal(out.max_completion_tokens, undefined);
});
