import { describe, it, expect, vi } from "vitest";
import { createResponsesApiTransformStream } from "../transformer/responsesTransformer.ts";

const sseEvent = (content: string) =>
  `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("responsesTransformer", () => {
  it("does not throw uncaught errors when the client disconnects mid-stream with heartbeat armed", async () => {
    // Fake timers so the pending heartbeat fires deterministically inside
    // advanceTimersByTime instead of on wall-clock latency.
    vi.useFakeTimers();
    try {
      const intervalMs = 50;
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseEvent("hello")));
          // Never closes: upstream keeps streaming when the client leaves.
        },
      });
      const stream = source.pipeThrough(
        createResponsesApiTransformStream(null, { heartbeatIntervalMs: intervalMs })
      );
      const reader = stream.getReader();
      await reader.read(); // first real event
      await reader.cancel();

      // Fires the heartbeat that was armed before cancellation.
      expect(() => vi.advanceTimersByTime(intervalMs * 2)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("decodes a multi-byte CJK character split across two chunks intact", async () => {
    const encoder = new TextEncoder();
    const all = encoder.encode(sseEvent("你好"));
    // Split between the first and second byte of "你" (E4 BD A0).
    const splitAt = all.findIndex((b, i) => b === 0xe4 && all[i + 1] === 0xbd);
    expect(splitAt).toBeGreaterThan(0);

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(all.slice(0, splitAt + 1));
        controller.enqueue(all.slice(splitAt + 1));
        controller.close();
      },
    });
    const stream = source.pipeThrough(createResponsesApiTransformStream(null));

    const output = await readAll(stream);
    const dataLine = output
      .split("\n")
      .find((line) => line.startsWith("data:") && line.includes("output_text.delta"));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.slice("data: ".length));
    expect(parsed.delta).toBe("你好");
  });
});
