/**
 * Non-streaming requests routed to a Responses-API provider used to arrive with empty
 * content whenever the provider delivered its reply through `response.output_text.delta`
 * and completed with an empty `output` array — which is exactly what codex does.
 *
 * The summary builder collected those deltas but only ever used them when no response
 * object had been seen at all, so in practice they were always discarded. The client got
 * `{ choices: [{ message: { content: "" } }] }` with a 200, and every non-streaming caller
 * read that as "the model said nothing" (the symptom that surfaced as Hermes failing to
 * generate conversation titles).
 *
 * These tests drive the collector and the classifier directly, since the raw upstream SSE
 * is not retained anywhere a test could replay it from.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { buildStreamSummaryFromEvents } =
  await import("../../open-sse/utils/streamPayloadCollector.ts");
const { isEmptyContentResponse } = await import("../../open-sse/services/errorClassifier.ts");
const { translateNonStreamingResponse } =
  await import("../../open-sse/handlers/responseTranslator.ts");

const event = (type, data) => ({ event: type, data });

const usage = {
  input_tokens: 92,
  output_tokens: 68,
  output_tokens_details: { reasoning_tokens: 55 },
};

/** A codex stream: text arrives only as deltas, and `completed` carries no output items. */
function codexDeltaOnlyStream(text, output = []) {
  return [
    event("response.created", {
      type: "response.created",
      response: { id: "resp_1", object: "response", model: "gpt-5.6-luna", status: "in_progress" },
    }),
    ...text.map((delta) =>
      event("response.output_text.delta", { type: "response.output_text.delta", delta })
    ),
    event("response.completed", {
      type: "response.completed",
      response: {
        id: "resp_1",
        object: "response",
        model: "gpt-5.6-luna",
        status: "completed",
        output,
        usage,
      },
    }),
  ];
}

test("delta text survives a completed event with an empty output array", () => {
  const summary = buildStreamSummaryFromEvents(
    codexDeltaOnlyStream(["Greeting ", "And Project Kickoff"]),
    "openai-responses",
    "gpt-5.6-luna"
  );

  const message = summary.output.find((item) => item.type === "message");
  assert.ok(message, "the collected deltas must be materialised as a message item");
  assert.equal(message.content[0].text, "Greeting And Project Kickoff");
});

test("reasoning items already in output are kept alongside the recovered text", () => {
  const reasoning = { type: "reasoning", summary: [] };
  const summary = buildStreamSummaryFromEvents(
    codexDeltaOnlyStream(["A title"], [reasoning]),
    "openai-responses",
    "gpt-5.6-luna"
  );

  assert.deepEqual(summary.output[0], reasoning, "the provider's own items must not be dropped");
  assert.equal(summary.output[1].content[0].text, "A title");
});

test("a provider that does populate output wins over the deltas", () => {
  // Belt and braces: the deltas are a gap-filler, never a second source of truth. Appending
  // them to an output that already holds the reply would duplicate every such response.
  const populated = [
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Canonical" }] },
  ];
  const summary = buildStreamSummaryFromEvents(
    codexDeltaOnlyStream(["Canonical"], populated),
    "openai-responses",
    "gpt-5.6-luna"
  );

  assert.equal(summary.output.length, 1);
  assert.equal(summary.output[0].content[0].text, "Canonical");
});

test("the recovered text reaches the client as chat.completion content", () => {
  // The end-to-end shape the failing caller actually reads.
  const summary = buildStreamSummaryFromEvents(
    codexDeltaOnlyStream(["Greeting And Project Kickoff"]),
    "openai-responses",
    "gpt-5.6-luna"
  );

  const translated = translateNonStreamingResponse(summary, "openai-responses", "openai");
  assert.equal(translated.choices[0].message.content, "Greeting And Project Kickoff");
  assert.equal(translated.choices[0].finish_reason, "stop");
});

test("a genuinely silent response with no tokens is reported as empty", () => {
  // The retry path could not fire before: the Responses shape fell through every branch of
  // isEmptyContentResponse and returned false, so a provider that answered with nothing was
  // handed to the client as a successful empty completion.
  const silent = { object: "response", model: "gpt-5.6-luna", output: [], usage: null };
  assert.equal(isEmptyContentResponse(silent), true);
});

test("a reasoning-only response is not reported as empty", () => {
  // Mirrors the carve-out the choices branch has made since the opencode fix: output tokens
  // mean the model did work, and declining to speak after reasoning is a valid answer.
  // Retrying those would be a regression across every reasoning model, not a fix.
  const reasoningOnly = { object: "response", model: "gpt-5.6-luna", output: [], usage };
  assert.equal(isEmptyContentResponse(reasoningOnly), false);
});

test("a response carrying only a tool call is not reported as empty", () => {
  const toolCall = {
    object: "response",
    model: "gpt-5.6-luna",
    output: [{ type: "function_call", name: "bash", arguments: "{}" }],
    usage: null,
  };
  assert.equal(isEmptyContentResponse(toolCall), false);
});

test("a response carrying text is not reported as empty", () => {
  const withText = {
    object: "response",
    model: "gpt-5.6-luna",
    output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "A title" }] },
    ],
    usage: null,
  };
  assert.equal(isEmptyContentResponse(withText), false);
});
