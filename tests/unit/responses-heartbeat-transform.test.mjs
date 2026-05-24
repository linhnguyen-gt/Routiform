import test from "node:test";
import assert from "node:assert/strict";

const { createResponsesApiTransformStream } =
  await import("../../open-sse/transformer/responsesTransformer.ts");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEventFrames(raw) {
  return raw
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith("event: "))
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines[0].slice("event: ".length);
      const dataLine = lines.find((line) => line.startsWith("data: "));
      const data = dataLine ? JSON.parse(dataLine.slice("data: ".length)) : null;
      return { event, data };
    });
}

async function collectTransformedText(chunks, heartbeatIntervalMs) {
  const input = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        if (chunk.delayMs) {
          await delay(chunk.delayMs);
        }
        controller.enqueue(new TextEncoder().encode(chunk.data));
      }
      controller.close();
    },
  });

  const output = input.pipeThrough(
    createResponsesApiTransformStream(null, {
      heartbeatIntervalMs,
    })
  );

  return new Response(output).text();
}

test("responses transformer emits keep-alive comments before the first upstream event", async () => {
  const raw = await collectTransformedText(
    [
      {
        delayMs: 25,
        data: 'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
      },
    ],
    10
  );

  const keepAliveIndex = raw.indexOf(": keep-alive");
  const createdIndex = raw.indexOf("event: response.created");
  assert.notEqual(keepAliveIndex, -1);
  assert.notEqual(createdIndex, -1);
  assert.ok(keepAliveIndex < createdIndex);

  const events = parseEventFrames(raw);
  assert.equal(events[0].event, "response.created");
  assert.equal(events.at(-1)?.event, "response.completed");
  const sequenceNumbers = events.map((entry) => entry.data?.sequence_number);
  assert.deepEqual(
    sequenceNumbers,
    Array.from({ length: sequenceNumbers.length }, (_, index) => index + 1)
  );
  assert.match(raw, /data: \[DONE\]\s*$/);
});

test("responses transformer emits keep-alive comments during idle gaps between semantic events", async () => {
  const raw = await collectTransformedText(
    [
      {
        data: 'data: {"id":"chatcmpl-2","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
      },
      {
        delayMs: 25,
        data: 'data: {"id":"chatcmpl-2","choices":[{"index":0,"finish_reason":"stop"}]}\n\n',
      },
    ],
    10
  );

  const deltaIndex = raw.indexOf("event: response.output_text.delta");
  const keepAliveIndex = raw.indexOf(": keep-alive", deltaIndex);
  const doneIndex = raw.indexOf("event: response.output_text.done");

  assert.notEqual(deltaIndex, -1);
  assert.notEqual(keepAliveIndex, -1);
  assert.notEqual(doneIndex, -1);
  assert.ok(deltaIndex < keepAliveIndex);
  assert.ok(keepAliveIndex < doneIndex);
  assert.match(raw, /data: \[DONE\]\s*$/);
});
