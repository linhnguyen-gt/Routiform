import { describe, expect, it } from "vitest";
import { sanitizeStreamingChunk } from "../handlers/responseSanitizer.ts";
import { openaiToClaudeRequest } from "../translator/request/openai-to-claude.ts";
import {
  openaiResponsesToOpenAIRequest,
  openaiToOpenAIResponsesRequest,
} from "../translator/request/openai-responses.ts";

describe("chat completions compatibility shims", () => {
  it("maps legacy functions and function_call into Claude tools and tool_choice", () => {
    const result = openaiToClaudeRequest(
      "claude-3-7-sonnet",
      {
        messages: [{ role: "user", content: "hi" }],
        functions: [
          {
            name: "calc",
            description: "Calculate",
            parameters: { type: "object", properties: { x: { type: "number" } } },
          },
        ],
        function_call: { name: "calc" },
      },
      false
    ) as Record<string, unknown>;

    expect(result.tools).toEqual([
      expect.objectContaining({
        name: "proxy_calc",
        description: "Calculate",
      }),
    ]);
    expect(result.tool_choice).toEqual({ type: "tool", name: "calc" });
  });

  it("treats developer messages as Claude system instructions", () => {
    const result = openaiToClaudeRequest(
      "claude-3-7-sonnet",
      {
        messages: [
          { role: "developer", content: "Follow the house style." },
          { role: "user", content: "hello" },
        ],
      },
      false
    ) as Record<string, unknown>;

    expect(result.system).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("Follow the house style.") }),
      ])
    );
  });

  it("maps legacy assistant function_call and function role into Claude tool blocks", () => {
    const result = openaiToClaudeRequest(
      "claude-3-7-sonnet",
      {
        messages: [
          {
            role: "assistant",
            content: null,
            function_call: { name: "calc", arguments: '{"x":2}' },
          },
          {
            role: "function",
            name: "calc",
            content: '{"value":4}',
          },
        ],
      },
      false
    ) as Record<string, unknown>;

    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0]?.content).toEqual([
      expect.objectContaining({ type: "tool_use", name: "proxy_calc" }),
    ]);
    expect(messages[1]?.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "call_calc" }),
    ]);
  });

  it("passes developer/functions/function_call/max_completion_tokens into Responses requests", () => {
    const result = openaiToOpenAIResponsesRequest(
      "gpt-4o",
      {
        messages: [
          { role: "developer", content: "Be concise." },
          { role: "user", content: "hello" },
        ],
        functions: [
          {
            name: "calc",
            description: "Calculate",
            parameters: { type: "object", properties: {} },
          },
        ],
        function_call: { name: "calc" },
        max_completion_tokens: 123,
      },
      false,
      null
    ) as Record<string, unknown>;

    expect(result.instructions).toContain("Be concise.");
    expect(result.tools).toEqual([
      expect.objectContaining({ type: "function", name: "calc" }),
    ]);
    expect(result.tool_choice).toEqual({ type: "function", name: "calc" });
    expect(result.max_completion_tokens).toBe(123);
  });

  it("converts Responses function_call/function_call_output back to Chat messages", () => {
    const result = openaiResponsesToOpenAIRequest(
      "gpt-4o",
      {
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
          {
            type: "function_call",
            call_id: "call_calc",
            name: "calc",
            arguments: '{"x":2}',
          },
          {
            type: "function_call_output",
            call_id: "call_calc",
            output: '{"value":4}',
          },
        ],
      },
      false,
      null
    ) as Record<string, unknown>;

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          tool_calls: [
            expect.objectContaining({
              function: expect.objectContaining({ name: "calc" }),
            }),
          ],
        }),
        expect.objectContaining({ role: "tool", tool_call_id: "call_calc" }),
      ])
    );
  });

  it("preserves refusal and official metadata in streaming chunks", () => {
    const result = sanitizeStreamingChunk({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 123,
      model: "gpt-4o-mini",
      system_fingerprint: "fp_123",
      service_tier: "priority",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            refusal: "Cannot comply.",
          },
          finish_reason: null,
        },
      ],
    }) as Record<string, unknown>;

    expect(result.system_fingerprint).toBe("fp_123");
    expect(result.service_tier).toBe("priority");
    expect(result.choices).toEqual([
      expect.objectContaining({
        index: 0,
        delta: expect.objectContaining({
          role: "assistant",
          refusal: "Cannot comply.",
        }),
      }),
    ]);
  });
});
