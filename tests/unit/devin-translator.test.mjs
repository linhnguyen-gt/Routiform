import test from "node:test";
import assert from "node:assert/strict";

import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";
import { translateNonStreamingResponse } from "../../open-sse/handlers/responseTranslator.ts";

test("Devin request translator flattens messages into prompt", () => {
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.DEVIN,
    "default",
    {
      messages: [
        { role: "system", content: "You are precise." },
        { role: "user", content: "Solve this bug" },
        {
          role: "assistant",
          content: "I will inspect logs",
          tool_calls: [
            {
              id: "call_1",
              function: { name: "read_logs", arguments: JSON.stringify({ path: "app.log" }) },
            },
          ],
        },
        { role: "tool", name: "read_logs", tool_call_id: "call_1", content: "stack trace" },
        { role: "user", content: [{ type: "text", text: "Give final answer" }] },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read_logs",
            description: "Read log file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
    },
    true,
    null,
    "devin"
  );

  assert.equal(typeof translated.prompt, "string");
  assert.match(translated.prompt, /Instructions:\nYou are precise\./);
  assert.match(translated.prompt, /Available tools:/);
  assert.match(translated.prompt, /User:\nSolve this bug/);
  assert.match(translated.prompt, /Assistant called tool read_logs:/);
  assert.match(translated.prompt, /Tool read_logs result:\nstack trace/);
  assert.match(translated.prompt, /User:\nGive final answer/);
});

test("Devin response translator converts native stream events to OpenAI chunks", () => {
  const state = initState(FORMATS.OPENAI);

  const started = translateResponse(
    FORMATS.DEVIN,
    FORMATS.OPENAI,
    { type: "start", id: "devin-1", created: 123, model: "default" },
    state
  );
  assert.equal(started?.length, 1);
  assert.equal(started?.[0]?.choices?.[0]?.delta?.role, "assistant");

  const text = translateResponse(
    FORMATS.DEVIN,
    FORMATS.OPENAI,
    { type: "text-delta", id: "devin-1", created: 123, model: "default", delta: "Hello" },
    state
  );
  assert.equal(text?.length, 1);
  assert.equal(text?.[0]?.choices?.[0]?.delta?.content, "Hello");

  const reasoning = translateResponse(
    FORMATS.DEVIN,
    FORMATS.OPENAI,
    { type: "reasoning-delta", id: "devin-1", created: 123, model: "default", delta: "Planning" },
    state
  );
  assert.equal(reasoning?.length, 1);
  assert.equal(reasoning?.[0]?.choices?.[0]?.delta?.reasoning_content, "Planning");

  const finished = translateResponse(
    FORMATS.DEVIN,
    FORMATS.OPENAI,
    {
      type: "finish",
      id: "devin-1",
      created: 123,
      model: "default",
      finishReason: "stop",
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    },
    state
  );

  assert.equal(finished?.length, 1);
  assert.equal(finished?.[0]?.choices?.[0]?.finish_reason, "stop");
  assert.deepEqual(finished?.[0]?.usage, {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3,
  });
});

test("Devin non-stream response normalizes through response translator", () => {
  const translated = translateNonStreamingResponse(
    {
      id: "devin-2",
      object: "devin.response",
      created: 456,
      model: "default",
      output_text: "Done",
      finish_reason: "stop",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    },
    FORMATS.DEVIN,
    FORMATS.OPENAI
  );

  assert.equal(translated.object, "chat.completion");
  assert.equal(translated.choices?.[0]?.message?.content, "Done");
  assert.equal(translated.choices?.[0]?.finish_reason, "stop");
});
