import test from "node:test";
import assert from "node:assert/strict";

// Characterizes the Kiro double-strip bug: KiroExecutor's own stripThinkingTags
// (open-sse/executors/kiro.ts) already removes literal <thinking>...</thinking>
// spans from assistantResponseEvent content before it ever reaches the generic
// SSE pipeline (open-sse/utils/stream.ts). It is fence-aware — a <thinking> marker
// inside a fenced code block (```...```) is deliberately left untouched, since Kiro
// drives coding agents that legitimately discuss prompt/tag formats in code samples.
//
// convertKiroToOpenAI (open-sse/translator/response/kiro-to-openai.ts) passes
// KiroExecutor's already-OpenAI-shaped chunks through unchanged. When the client is
// OpenAI-format (sourceFormat === "openai"), stream.ts's translate-mode loop runs a
// SECOND stripper — extractThinkingFromContent (open-sse/handlers/responseSanitizer.ts)
// — over the same delta.content. That second stripper has NO code-fence awareness:
// its regex blindly matches <thinking>...</thinking> anywhere in the string, so it
// deletes the exact fenced content the first stripper was designed to preserve.
const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function driveStream(stream, sseLines) {
  const writer = stream.writable.getWriter();
  for (const line of sseLines) {
    await writer.write(encoder.encode(line));
  }
  await writer.close();

  const reader = stream.readable.getReader();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
}

function extractAssistantContent(output) {
  return output
    .split("\n")
    .filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice(5).trim()))
    .map((chunk) => chunk.choices?.[0]?.delta?.content)
    .filter((c) => typeof c === "string")
    .join("");
}

test("Kiro stream: a <thinking> tag preserved inside a fenced code block by the executor's own stripper must survive the generic SSE pipeline untouched", async () => {
  const stream = createSSETransformStreamWithLogger(
    FORMATS.KIRO,
    FORMATS.OPENAI,
    "kiro",
    null,
    null,
    "claude-sonnet-4.5",
    "conn-kiro-double-strip-1",
    { messages: [{ role: "user", content: "show me the tag format" }] },
    () => {},
    null
  );

  // This is exactly what KiroExecutor emits AFTER its own stripThinkingTags has
  // already run (executors/kiro.ts:352) — a fenced code block containing a
  // <thinking> example, deliberately left intact because it's inside a code fence.
  const fencedThinkingExample = "```\n<thinking>note</thinking>\n```";

  const output = await driveStream(stream, [
    `data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":${JSON.stringify(fencedThinkingExample)}},"finish_reason":null}]}\n\n`,
    `data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
    "data: [DONE]\n\n",
  ]);

  const content = extractAssistantContent(output);
  assert.equal(
    content,
    fencedThinkingExample,
    "fenced <thinking> example must survive the generic SSE pipeline unmodified " +
      `(a second, fence-unaware stripper would corrupt it), got: ${JSON.stringify(content)}`
  );
});

// Regression guard: the fix must only disable the generic stripper for provider
// "kiro" — every other provider must keep relying on stream.ts's generic
// extractThinkingFromContent to strip inline <think>/<thinking> tags, since those
// providers have no equivalent executor-level stripper of their own.
test("Non-Kiro provider stream: generic <thinking> stripping still runs unchanged", async () => {
  const stream = createSSETransformStreamWithLogger(
    FORMATS.KIRO,
    FORMATS.OPENAI,
    "some-other-provider",
    null,
    null,
    "some-model",
    "conn-non-kiro-strip-1",
    { messages: [{ role: "user", content: "hi" }] },
    () => {},
    null
  );

  const rawContent = "before <thinking>secret reasoning</thinking> after";

  const output = await driveStream(stream, [
    `data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":${JSON.stringify(rawContent)}},"finish_reason":null}]}\n\n`,
    `data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
    "data: [DONE]\n\n",
  ]);

  const content = extractAssistantContent(output);
  assert.equal(
    content,
    "before  after",
    `expected the generic stripper to remove the <thinking> span, got: ${JSON.stringify(content)}`
  );
});
