import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSSEToResponsesOutput } from "../../open-sse/handlers/sseParser.ts";
import {
  collectResponsesStreamedText,
  mergeStreamedTextIntoOutput,
  outputCarriesAssistantText,
} from "../../open-sse/utils/responses-output-text.ts";

/**
 * Shaped after a real Codex reply captured in a call log: `response.completed` reports
 * `output_tokens: 11` and `status: "completed"` while carrying `output: []`, because the text
 * was delivered through `response.output_text.delta` events alone.
 */
const codexStyleSSE = [
  `data: ${JSON.stringify({
    type: "response.created",
    response: { id: "resp_1", object: "response", model: "gpt-5.6-luna", output: [] },
  })}`,
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Số lượng " })}`,
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "hooks AgentKit" })}`,
  `data: ${JSON.stringify({
    type: "response.completed",
    response: {
      id: "resp_1",
      object: "response",
      model: "gpt-5.6-luna",
      status: "completed",
      output: [],
      usage: { input_tokens: 176, output_tokens: 11, total_tokens: 187 },
    },
  })}`,
  "data: [DONE]",
  "",
].join("\n\n");

describe("Responses-API text recovery", () => {
  describe("parseSSEToResponsesOutput", () => {
    it("recovers the reply Codex sends only as output_text deltas", () => {
      const parsed = parseSSEToResponsesOutput(codexStyleSSE, "gpt-5.6-luna");

      assert.equal(parsed.status, "completed");
      assert.deepEqual(parsed.output, [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Số lượng hooks AgentKit" }],
        },
      ]);
      assert.equal(parsed.usage.output_tokens, 11);
    });

    it("leaves an output that already carries the reply untouched", () => {
      const populated = [
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "streamed" })}`,
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_2",
            object: "response",
            model: "m",
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "authoritative" }],
              },
            ],
          },
        })}`,
        "data: [DONE]",
        "",
      ].join("\n\n");

      const parsed = parseSSEToResponsesOutput(populated, "m");
      assert.equal(parsed.output.length, 1);
      assert.equal(parsed.output[0].content[0].text, "authoritative");
    });

    it("keeps reasoning and tool-call items while appending the recovered text", () => {
      const withReasoning = [
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "answer" })}`,
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_3",
            object: "response",
            model: "m",
            status: "completed",
            output: [{ type: "reasoning", summary: [] }],
          },
        })}`,
        "data: [DONE]",
        "",
      ].join("\n\n");

      const parsed = parseSSEToResponsesOutput(withReasoning, "m");
      assert.equal(parsed.output.length, 2);
      assert.equal(parsed.output[0].type, "reasoning");
      assert.equal(parsed.output[1].content[0].text, "answer");
    });

    it("still returns an empty output when the model really said nothing", () => {
      const silent = [
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_4",
            object: "response",
            model: "m",
            status: "completed",
            output: [],
          },
        })}`,
        "data: [DONE]",
        "",
      ].join("\n\n");

      assert.deepEqual(parseSSEToResponsesOutput(silent, "m").output, []);
    });
  });

  describe("shared merge rule", () => {
    it("detects assistant text only in message items with non-empty output_text", () => {
      assert.equal(outputCarriesAssistantText([{ type: "reasoning", summary: [] }]), false);
      assert.equal(
        outputCarriesAssistantText([
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "" }] },
        ]),
        false
      );
      assert.equal(
        outputCarriesAssistantText([
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "x" }] },
        ]),
        true
      );
    });

    it("is a no-op without streamed text", () => {
      const output = [{ type: "reasoning" }];
      assert.deepEqual(mergeStreamedTextIntoOutput(output, ""), output);
      assert.deepEqual(mergeStreamedTextIntoOutput(undefined, ""), []);
    });

    it("concatenates output_text deltas in arrival order", () => {
      assert.equal(
        collectResponsesStreamedText([
          { type: "response.output_text.delta", delta: "a" },
          { type: "response.reasoning_summary_text.delta", delta: "IGNORED" },
          { type: "response.output_text.delta", delta: "b" },
        ]),
        "ab"
      );
    });
  });
});
