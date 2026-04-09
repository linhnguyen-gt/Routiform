import { describe, it, expect, vi } from "vitest";
import { transformToOllama } from "../utils/ollamaTransform.ts";

async function readTransformedLines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("ollamaTransform incomplete stream warning", () => {
  it("should log warning when stream ends with unparsed buffer", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create a mock response with incomplete SSE data
    const incompleteData = 'data: {"choices":[{"delta":{"content":"test"}}]}\ndata: incomplete';
    const mockResponse = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(incompleteData));
          controller.close();
        },
      }),
    };

    const transformed = transformToOllama(mockResponse, "test-model");
    const reader = transformed.body.getReader();

    // Read all chunks
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    // Verify warning was logged for unparsed buffer
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ollamaTransform] Stream ended with unparsed buffer"),
      expect.stringContaining("incomplete")
    );

    consoleWarnSpy.mockRestore();
  });

  it("should not log warning when stream ends cleanly", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create a mock response with complete SSE data
    const completeData = 'data: {"choices":[{"delta":{"content":"test"}}]}\ndata: [DONE]\n';
    const mockResponse = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(completeData));
          controller.close();
        },
      }),
    };

    const transformed = transformToOllama(mockResponse, "test-model");
    const reader = transformed.body.getReader();

    // Read all chunks
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    // Verify no warning was logged
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[ollamaTransform] Stream ended with unparsed buffer")
    );

    consoleWarnSpy.mockRestore();
  });

  it("streams reasoning_content as fallback content for Ollama clients", async () => {
    const sse =
      'data: {"choices":[{"delta":{"reasoning_content":"hello from reasoning"}}]}\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n' +
      "data: [DONE]\n";

    const mockResponse = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    };

    const transformed = transformToOllama(mockResponse, "kimi-k2.5");
    const lines = await readTransformedLines(transformed);

    expect(lines[0]).toEqual({
      model: "kimi-k2.5",
      message: { role: "assistant", content: "hello from reasoning" },
      done: false,
    });
    expect(lines.at(-1)).toEqual({
      model: "kimi-k2.5",
      message: { role: "assistant", content: "" },
      done: true,
    });
  });
});
