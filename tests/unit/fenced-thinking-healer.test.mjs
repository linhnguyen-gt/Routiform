import test from "node:test";
import assert from "node:assert/strict";

test("FencedThinkingScanner parses XML <think> tags across streaming chunks", async () => {
  const { FencedThinkingScanner } = await import("../../open-sse/utils/fencedThinking.ts");

  const scanner = new FencedThinkingScanner();

  // Chunk 1: Partial open tag
  const r1 = scanner.feed("Hello! <th");
  assert.equal(r1.content, "Hello! ");
  assert.equal(r1.thinking, "");
  assert.equal(r1.inThinking, false);

  // Chunk 2: Complete open tag and partial thinking
  const r2 = scanner.feed("ink>Let me think about this...");
  assert.equal(r2.content, "");
  assert.equal(r2.thinking, "Let me think about this...");
  assert.equal(r2.inThinking, true);

  // Chunk 3: More thinking and partial close tag
  const r3 = scanner.feed(" Still thinking. </th");
  assert.equal(r3.content, "");
  assert.equal(r3.thinking, " Still thinking. ");
  assert.equal(r3.inThinking, true);

  // Chunk 4: Complete close tag and visible answer
  const r4 = scanner.feed("ink>Here is the final answer!");
  assert.equal(r4.content, "Here is the final answer!");
  assert.equal(r4.thinking, "");
  assert.equal(r4.inThinking, false);
});

test("FencedThinkingScanner handles nested code fences inside ```thinking block", async () => {
  const { FencedThinkingScanner } = await import("../../open-sse/utils/fencedThinking.ts");

  const scanner = new FencedThinkingScanner();

  const text = [
    "```thinking",
    "I should write a python function:",
    "```python",
    "def add(a, b):",
    "    return a + b",
    "```",
    "Now I'm done thinking.",
    "```",
    "Here is the function you asked for:",
  ].join("\n");

  const result = scanner.feed(text, true);
  assert.ok(result.thinking.includes("def add(a, b):"));
  assert.ok(result.thinking.includes("Now I'm done thinking."));
  assert.ok(result.content.includes("Here is the function you asked for:"));
  assert.ok(!result.content.includes("def add(a, b):"));
});

test("LeakedThinkingStreamHealer separates leaked thinking into reasoning_content deltas", async () => {
  const { LeakedThinkingStreamHealer } =
    await import("../../open-sse/utils/leakedThinkingHealer.ts");

  const healer = new LeakedThinkingStreamHealer();

  const chunks = ["<think>", "Analyzing user query...", "</think>", "Hello! How can I assist you?"];

  const emitted = [];
  for (const chunk of chunks) {
    emitted.push(...healer.feed(chunk));
  }
  emitted.push(...healer.flush());

  const reasoningParts = emitted.filter((e) => e.reasoning_content).map((e) => e.reasoning_content);
  const contentParts = emitted.filter((e) => e.content).map((e) => e.content);

  assert.ok(reasoningParts.join("").includes("Analyzing user query..."));
  assert.ok(contentParts.join("").includes("Hello! How can I assist you?"));
});

test("healNonStreamingPayload extracts thinking into reasoning_content for choices", async () => {
  const { healNonStreamingPayload } = await import("../../open-sse/utils/leakedThinkingHealer.ts");

  const payload = {
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "<think>Planning the solution step by step</think>The answer is 42.",
        },
        finish_reason: "stop",
      },
    ],
  };

  const healed = healNonStreamingPayload(payload);
  const choice = healed.choices[0];
  assert.equal(choice.message.content, "The answer is 42.");
  assert.equal(choice.message.reasoning_content, "Planning the solution step by step");
});

test("extractThinkingFromContent handles both XML tags and fenced blocks", async () => {
  const { extractThinkingFromContent } =
    await import("../../open-sse/handlers/responseSanitizer.ts");

  // 1. XML tags
  const xmlRes = extractThinkingFromContent("<think>Thought process</think>Visible text");
  assert.equal(xmlRes.thinking, "Thought process");
  assert.equal(xmlRes.content, "Visible text");

  // 2. Fenced blocks
  const fenceRes = extractThinkingFromContent("```thought\nFenced reasoning\n```\nVisible reply");
  assert.equal(fenceRes.thinking, "Fenced reasoning");
  assert.equal(fenceRes.content, "Visible reply");
});
