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
