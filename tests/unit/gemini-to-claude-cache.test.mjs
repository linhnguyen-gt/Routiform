import test from "node:test";
import assert from "node:assert/strict";

const { geminiToClaudeResponse } =
  await import("../../open-sse/translator/response/gemini-to-claude.ts");
const { isCompactSummarizerRequest } =
  await import("../../open-sse/services/claudeCodeHelperCombo.ts");

function geminiChunk({
  prompt,
  cached,
  candidates = 10,
  thoughts = 0,
  finish = "STOP",
  text = "ok",
}) {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason: finish,
      },
    ],
    usageMetadata: {
      promptTokenCount: prompt,
      candidatesTokenCount: candidates,
      thoughtsTokenCount: thoughts,
      cachedContentTokenCount: cached,
    },
    responseId: "resp_1",
    modelVersion: "gemini-3.7-flash",
  };
}

test("gemini-to-claude peels inclusive promptTokenCount so CC does not sum cache twice", () => {
  const events = geminiToClaudeResponse(
    geminiChunk({ prompt: 362198, cached: 359283, candidates: 4196 }),
    {}
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 362198 - 359283);
  assert.equal(delta.usage.cache_read_input_tokens, 359283);
  assert.equal(delta.usage.output_tokens, 4196);
});

test("gemini-to-claude message_start uses promptUsageSeed instead of zeros", () => {
  const events = geminiToClaudeResponse(geminiChunk({ prompt: 100, cached: 0, finish: null }), {
    promptUsageSeed: { input_tokens: 48000 },
  });
  const start = events.find((e) => e.type === "message_start");
  assert.equal(start.message.usage.input_tokens, 48000);
});

test("gemini-to-claude compact floor strips cache from the client meter", () => {
  const events = geminiToClaudeResponse(
    geminiChunk({ prompt: 362198, cached: 359283, candidates: 4196 }),
    {
      promptUsageSeed: { input_tokens: 52000 },
      forcePromptUsageSeed: true,
    }
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 52000);
  assert.equal(delta.usage.cache_read_input_tokens, undefined);
});

test("gemini-to-claude keeps thoughtsTokenCount as reasoning_tokens", () => {
  const events = geminiToClaudeResponse(
    geminiChunk({ prompt: 1000, cached: 200, candidates: 10, thoughts: 40 }),
    {}
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 800);
  assert.equal(delta.usage.cache_read_input_tokens, 200);
  assert.equal(delta.usage.reasoning_tokens, 40);
  assert.equal(delta.usage.output_tokens, 50);
});

test("compact detector finds the summarizer prompt buried before trailing reminders", () => {
  const body = {
    tools: [{ name: "Bash" }, { name: "Read" }],
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "working" },
      {
        role: "user",
        content:
          "Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests.",
      },
      {
        role: "system",
        content: [{ type: "text", text: "<total_tokens>14866579 tokens left</total_tokens>" }],
      },
    ],
  };
  assert.equal(isCompactSummarizerRequest(body), true);
});
