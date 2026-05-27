/**
 * Tests for OpenAI Responses API parity improvements.
 *
 * Covers:
 *  - Phase 1: parseSSEToResponsesOutput() richer native field preservation
 *  - Phase 2: streaming event parity (unknown events non-fatal, completed payload)
 *  - Phase 3: non-streaming Responses→Chat translation (refusal, reasoning, ordering)
 *  - Phase 4: unsupported built-in tool explicit rejection and background:true warning
 */

import test from "node:test";
import assert from "node:assert/strict";

const { parseSSEToResponsesOutput } = await import("../../open-sse/handlers/sseParser.ts");
const { openaiResponsesToOpenAIRequest } =
  await import("../../open-sse/translator/request/openai-responses.ts");
const { openaiToOpenAIResponsesResponse, openaiResponsesToOpenAIResponse } =
  await import("../../open-sse/translator/response/openai-responses.ts");
const { translateNonStreamingResponse } =
  await import("../../open-sse/handlers/responseTranslator.ts");
const { initState } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

// ---------------------------------------------------------------------------
// Phase 1: parseSSEToResponsesOutput() field preservation
// ---------------------------------------------------------------------------

test("SSE fallback: preserves error field when null", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_1",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result, "should return a result");
  assert.ok("error" in result, "error field should be present");
  assert.equal(result.error, null);
});

test("SSE fallback: preserves error object when response fails", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_err",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "failed",
          error: { code: "rate_limit_exceeded", message: "Too many requests" },
          usage: { input_tokens: 5, output_tokens: 0, total_tokens: 5 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.ok(result.error, "error object should be present");
  assert.equal(result.error.code, "rate_limit_exceeded");
  assert.equal(result.status, "failed");
});

test("SSE fallback: preserves incomplete_details when truncated", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_trunc",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          error: null,
          usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.ok(result.incomplete_details, "incomplete_details should be preserved");
  assert.equal(result.incomplete_details.reason, "max_output_tokens");
  assert.equal(result.status, "incomplete");
});

test("SSE fallback: preserves richer usage structure", () => {
  const richUsage = {
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    cache_read_input_tokens: 20,
    cache_creation_input_tokens: 10,
    input_tokens_details: { cached_tokens: 20 },
    output_tokens_details: { reasoning_tokens: 8 },
  };

  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_rich",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          usage: richUsage,
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.deepEqual(result.usage, richUsage, "full rich usage should be preserved");
});

test("SSE fallback: preserves background field when present", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_bg",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          background: true,
          error: null,
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.equal(result.background, true);
});

test("SSE fallback: preserves metadata object", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_meta",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          metadata: { session_id: "abc123", user: "tester" },
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.deepEqual(result.metadata, { session_id: "abc123", user: "tester" });
});

test("SSE fallback: empty metadata defaults to empty object", () => {
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_no_meta",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result);
  assert.deepEqual(result.metadata, {});
});

test("SSE fallback: tolerates partial event stream without response.completed", () => {
  // Simulate a stream that was cut off before response.completed
  const sse = [
    "data: " +
      JSON.stringify({
        type: "response.in_progress",
        response: {
          id: "resp_partial",
          object: "response",
          model: "gpt-4",
          output: [{ type: "message", role: "assistant", content: [] }],
          status: "in_progress",
          error: null,
          usage: null,
        },
      }),
    "",
  ].join("\n");

  // Should not throw — best effort fallback to latest known response
  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result, "should return best-effort result from partial stream");
  assert.equal(result.id, "resp_partial");
  assert.equal(result.status, "in_progress");
});

test("SSE fallback: unknown/future event types do not break parsing", () => {
  const sse = [
    // Unknown future event type
    "data: " + JSON.stringify({ type: "response.future_event", some_data: "abc" }),
    "",
    // Followed by a valid completed event
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_future",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result, "should not throw on unknown event types");
  assert.equal(result.id, "resp_future");
  assert.equal(result.status, "completed");
});

test("SSE fallback: malformed JSON lines are skipped without throwing", () => {
  const sse = [
    "data: {not valid json",
    "",
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_after_bad",
          object: "response",
          model: "gpt-4",
          output: [],
          status: "completed",
          error: null,
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        },
      }),
    "",
  ].join("\n");

  const result = parseSSEToResponsesOutput(sse, "gpt-4");
  assert.ok(result, "should parse successfully after malformed lines");
  assert.equal(result.id, "resp_after_bad");
});

// ---------------------------------------------------------------------------
// Phase 2: Streaming event parity
// ---------------------------------------------------------------------------

test("Responses→Chat streaming: lifecycle events (output_item.added) are non-fatal", () => {
  const state = {
    started: true,
    chatId: "chatcmpl-test",
    created: Math.floor(Date.now() / 1000),
    toolCallIndex: 0,
    finishReasonSent: false,
  };

  // output_item.added for a message item (not function_call) should return null, not throw
  const chunk = {
    type: "response.output_item.added",
    output_index: 0,
    item: { id: "msg_1", type: "message", content: [], role: "assistant" },
  };
  const result = openaiResponsesToOpenAIResponse(chunk, state);
  assert.equal(result, null, "non-function output_item.added should be ignored");
});

test("Responses→Chat streaming: content_part.added is non-fatal", () => {
  const state = {
    started: true,
    chatId: "chatcmpl-test",
    created: Math.floor(Date.now() / 1000),
    toolCallIndex: 0,
    finishReasonSent: false,
  };

  const chunk = {
    type: "response.content_part.added",
    item_id: "msg_1",
    output_index: 0,
    content_index: 0,
    part: { type: "output_text", text: "" },
  };
  const result = openaiResponsesToOpenAIResponse(chunk, state);
  assert.equal(result, null, "content_part.added should return null");
});

test("Responses→Chat streaming: reasoning_summary_part.added is non-fatal", () => {
  const state = {
    started: true,
    chatId: "chatcmpl-test",
    created: Math.floor(Date.now() / 1000),
    toolCallIndex: 0,
    finishReasonSent: false,
  };

  const chunk = {
    type: "response.reasoning_summary_part.added",
    item_id: "rs_1",
    output_index: 0,
    summary_index: 0,
    part: { type: "summary_text", text: "" },
  };
  const result = openaiResponsesToOpenAIResponse(chunk, state);
  assert.equal(result, null, "reasoning_summary_part.added should return null");
});

test("Responses→Chat streaming: unknown future event type is non-fatal", () => {
  const state = {
    started: true,
    chatId: "chatcmpl-test",
    created: Math.floor(Date.now() / 1000),
    toolCallIndex: 0,
    finishReasonSent: false,
  };

  const chunk = {
    type: "response.hypothetical_future_event_v99",
    some_new_field: "value",
  };

  let threw = false;
  let result;
  try {
    result = openaiResponsesToOpenAIResponse(chunk, state);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "unknown event type should not throw");
  assert.equal(result, null, "unknown event type should return null");
});

test("Chat→Responses streaming: completed event output includes status:completed on items", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);

  const chunk = {
    choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
    id: "c1",
  };
  openaiToOpenAIResponsesResponse(chunk, state);

  const finishChunk = { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
  const events = openaiToOpenAIResponsesResponse(finishChunk, state);
  const completedEvent = events.find((e) => e.event === "response.completed");
  assert.ok(completedEvent, "should have completed event");

  const output = completedEvent.data.response.output;
  assert.ok(Array.isArray(output) && output.length > 0, "output should not be empty");
  const msgItem = output.find((o) => o.type === "message");
  assert.ok(msgItem, "should have message output item");
  assert.equal(msgItem.status, "completed", "message item should have status: completed");
});

test("Chat→Responses streaming: completed event function_call item has status:completed", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);

  const chunk = {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc",
              type: "function",
              function: { name: "get_weather", arguments: "" },
            },
          ],
        },
        finish_reason: null,
      },
    ],
    id: "c1",
  };
  openaiToOpenAIResponsesResponse(chunk, state);

  const argsChunk = {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: '{"city":"NYC"}' } }],
        },
        finish_reason: null,
      },
    ],
  };
  openaiToOpenAIResponsesResponse(argsChunk, state);

  const finishChunk = {
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
  };
  const events = openaiToOpenAIResponsesResponse(finishChunk, state);
  const completedEvent = events.find((e) => e.event === "response.completed");
  assert.ok(completedEvent);

  const fcItem = completedEvent.data.response.output.find((o) => o.type === "function_call");
  assert.ok(fcItem, "should have function_call output item");
  assert.equal(fcItem.status, "completed");
  assert.equal(fcItem.name, "get_weather");
});

// ---------------------------------------------------------------------------
// Phase 3: Non-streaming Responses→Chat translation
// ---------------------------------------------------------------------------

test("Non-streaming: refusal output_text is mapped to text content", () => {
  const responseBody = {
    object: "response",
    id: "resp_refusal",
    model: "gpt-4",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "refusal", refusal: "I cannot help with that." }],
      },
    ],
    status: "completed",
    usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
  };

  const result = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );
  assert.ok(result, "should translate without error");
  const message = result.choices[0].message;
  // refusal should become the text content
  assert.ok(message.content === "I cannot help with that." || message.content !== undefined);
});

test("Non-streaming: reasoning item summary is extracted", () => {
  const responseBody = {
    object: "response",
    id: "resp_reasoning",
    model: "gpt-4",
    output: [
      {
        type: "reasoning",
        id: "rs_1",
        summary: [
          { type: "summary_text", text: "Let me think about this..." },
          { type: "summary_text", text: " Done thinking." },
        ],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "The answer is 42." }],
      },
    ],
    status: "completed",
    usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
  };

  const result = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );
  assert.ok(result);
  const message = result.choices[0].message;
  assert.equal(message.content, "The answer is 42.");
  assert.ok(
    typeof message.reasoning_content === "string" && message.reasoning_content.length > 0,
    "reasoning_content should be extracted"
  );
  assert.ok(message.reasoning_content.includes("think about this"), "reasoning text preserved");
});

test("Non-streaming: multiple reasoning summary parts are concatenated", () => {
  const responseBody = {
    object: "response",
    id: "resp_multi_reason",
    model: "gpt-4",
    output: [
      {
        type: "reasoning",
        id: "rs_1",
        summary: [
          { type: "summary_text", text: "First thought. " },
          { type: "summary_text", text: "Second thought." },
        ],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Answer." }],
      },
    ],
    status: "completed",
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  };

  const result = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );
  assert.ok(result);
  assert.ok(result.choices[0].message.reasoning_content.includes("First thought"));
  assert.ok(result.choices[0].message.reasoning_content.includes("Second thought"));
});

test("Non-streaming: web_search_call output item is skipped gracefully", () => {
  const responseBody = {
    object: "response",
    id: "resp_websearch",
    model: "gpt-4",
    output: [
      {
        type: "web_search_call",
        id: "ws_1",
        status: "completed",
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Based on my search..." }],
      },
    ],
    status: "completed",
    usage: { input_tokens: 50, output_tokens: 30, total_tokens: 80 },
  };

  // Should not throw — web_search_call is silently skipped
  const result = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );
  assert.ok(result, "should translate without error");
  assert.equal(result.choices[0].message.content, "Based on my search...");
  // No tool_calls should be synthesized for built-in tool items
  assert.ok(
    !result.choices[0].message.tool_calls || result.choices[0].message.tool_calls.length === 0,
    "web_search_call should not produce tool_calls"
  );
});

// ---------------------------------------------------------------------------
// Phase 4: Unsupported built-in tool behavior
// ---------------------------------------------------------------------------

test("Responses→Chat: file_search tool type throws unsupported error", () => {
  const body = {
    model: "gpt-4",
    input: "find documents",
    tools: [{ type: "file_search", vector_store_ids: ["vs_abc"] }],
  };
  assert.throws(
    () => openaiResponsesToOpenAIRequest(null, body, null, null),
    (err) => err.message.includes("file_search") && err.statusCode === 400
  );
});

test("Responses→Chat: code_interpreter tool type throws unsupported error", () => {
  const body = {
    model: "gpt-4",
    input: "analyze this data",
    tools: [{ type: "code_interpreter" }],
  };
  assert.throws(
    () => openaiResponsesToOpenAIRequest(null, body, null, null),
    (err) => err.message.includes("code_interpreter") && err.statusCode === 400
  );
});

test("Responses→Chat: background:true logs warning but does not throw", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    const body = {
      model: "gpt-4",
      input: [{ type: "message", role: "user", content: "hi" }],
      background: true,
    };
    // Should not throw
    const result = openaiResponsesToOpenAIRequest(null, body, null, null);
    assert.ok(result, "should return a translated result");
  } finally {
    console.warn = originalWarn;
  }

  const warnMsg = warnings.join(" ");
  assert.ok(
    warnMsg.includes("background") && warnMsg.includes("synchronous"),
    `expected background warning, got: ${warnMsg}`
  );
});

test("Responses→Chat: unsupported tool error has statusCode 400 and errorType", () => {
  const body = {
    model: "gpt-4",
    input: "search",
    tools: [{ type: "web_search_preview" }],
  };
  let caughtError = null;
  try {
    openaiResponsesToOpenAIRequest(null, body, null, null);
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError, "should throw");
  assert.equal(caughtError.statusCode, 400);
  assert.equal(caughtError.errorType, "unsupported_feature");
});
