import test from "node:test";
import assert from "node:assert/strict";

const { estimateInputTokens, addBufferToUsage, ESTIMATED_IMAGE_TOKENS } =
  await import("../../open-sse/utils/usageTracking.ts");
const { openaiToClaudeResponse } =
  await import("../../open-sse/translator/response/openai-to-claude.ts");
const { isCompactSummarizerRequest } =
  await import("../../open-sse/services/claudeCodeHelperCombo.ts");
const { shouldRememberPromptUsage } = await import("../../open-sse/services/promptUsageMemory.ts");

const PNG_BASE64 = "A".repeat(90000);

test("estimateInputTokens does not treat PNG base64 as language tokens", () => {
  const withImage = estimateInputTokens({
    tools: [
      {
        name: "Read",
        input_schema: { type: "object", properties: { file_path: { type: "string" } } },
      },
    ],
    system: "You are Claude Code.",
    messages: [
      { role: "user", content: "compare this screenshot" },
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: PNG_BASE64 },
          },
        ],
      },
    ],
  });
  const jsonDump = estimateInputTokens({
    messages: [{ role: "user", content: PNG_BASE64 }],
  });
  assert.ok(withImage < 8000, `image request should stay small, got ${withImage}`);
  assert.ok(withImage >= ESTIMATED_IMAGE_TOKENS);
  assert.ok(jsonDump <= ESTIMATED_IMAGE_TOKENS + 20, `base64 string must cap, got ${jsonDump}`);
});

test("excludeMessages drops transcript tokens used only for compact", () => {
  const body = {
    system: "You are a helpful AI assistant tasked with summarizing conversations.",
    tools: [{ name: "Bash", input_schema: { type: "object" } }],
    messages: Array.from({ length: 80 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i} ` + "context ".repeat(200),
    })),
  };
  const full = estimateInputTokens(body);
  const floor = estimateInputTokens(body, { excludeMessages: true });
  assert.ok(full > floor * 5, `full=${full} floor=${floor}`);
  assert.ok(floor > 0);
});

test("isCompactSummarizerRequest matches CC compact prompt even with a full toolbag", () => {
  const body = {
    tools: [{ name: "Bash" }, { name: "Read" }],
    messages: [
      {
        role: "user",
        content:
          "Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests.",
      },
    ],
  };
  assert.equal(isCompactSummarizerRequest(body), true);
  assert.equal(shouldRememberPromptUsage(body), false);
  assert.equal(
    isCompactSummarizerRequest({
      tools: [{ name: "Bash" }],
      messages: [{ role: "user", content: "fix the login bug" }],
    }),
    false
  );
});

test("openai-to-claude compact finish keeps the prompt floor, not the transcript estimate", () => {
  const state = {
    messageStartSent: true,
    messageId: "msg_compact",
    model: "glm-5.3-flash",
    nextBlockIndex: 1,
    textBlockStarted: false,
    textBlockClosed: true,
    thinkingBlockStarted: false,
    toolCalls: new Map(),
    usage: {
      input_tokens: 390000,
      output_tokens: 5991,
      cache_read_input_tokens: 300000,
    },
    promptUsageSeed: { input_tokens: 48000 },
    forcePromptUsageSeed: true,
  };
  const events = openaiToClaudeResponse(
    { id: "chatcmpl-1", model: "glm-5.3-flash", choices: [{ finish_reason: "stop", delta: {} }] },
    state
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 48000);
  assert.equal(delta.usage.output_tokens, 5991);
  assert.equal(delta.usage.cache_read_input_tokens, undefined);
});

test("estimateInputTokens caps data:application/pdf;base64 blobs", () => {
  const pdf = "data:application/pdf;base64," + "A".repeat(50000);
  const tokens = estimateInputTokens({
    messages: [{ role: "user", content: pdf }],
  });
  assert.ok(tokens <= ESTIMATED_IMAGE_TOKENS + 20, `got ${tokens}`);
});

test("100% cache-hit finish does not reseed exclusive input on top of cache_read", () => {
  const state = {
    messageStartSent: true,
    messageId: "msg_cache",
    model: "glm-5.3-flash",
    nextBlockIndex: 1,
    textBlockStarted: false,
    textBlockClosed: true,
    thinkingBlockStarted: false,
    toolCalls: new Map(),
    usage: { input_tokens: 0, output_tokens: 10, cache_read_input_tokens: 200000 },
    promptUsageSeed: { input_tokens: 200000 },
    forcePromptUsageSeed: false,
  };
  const events = openaiToClaudeResponse(
    { id: "chatcmpl-3", model: "glm-5.3-flash", choices: [{ finish_reason: "stop", delta: {} }] },
    state
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 0);
  assert.equal(delta.usage.cache_read_input_tokens, 200000);
});

test("addBufferToUsage does not pad exclusive input when cache_read is present", () => {
  const padded = addBufferToUsage({
    input_tokens: 110444,
    output_tokens: 258,
    cache_read_input_tokens: 25216,
  });
  assert.equal(padded.input_tokens, 110444);
  assert.equal(padded.cache_read_input_tokens, 25216);
});

test("openai-to-claude keeps DeepSeek cache hit and reasoning_tokens on state.usage", () => {
  const state = {
    messageStartSent: true,
    messageId: "msg_ds",
    model: "deepseek-v4-flash-vision-exp",
    nextBlockIndex: 1,
    textBlockStarted: false,
    textBlockClosed: true,
    thinkingBlockStarted: false,
    toolCalls: new Map(),
  };
  const events = openaiToClaudeResponse(
    {
      id: "chatcmpl-ds",
      model: "deepseek-v4-flash-vision-exp",
      choices: [{ finish_reason: "tool_calls", delta: {} }],
      usage: {
        prompt_tokens: 317988,
        completion_tokens: 304,
        total_tokens: 318292,
        prompt_tokens_details: { cached_tokens: 27776 },
        completion_tokens_details: { reasoning_tokens: 69 },
        prompt_cache_hit_tokens: 27776,
      },
    },
    state
  );
  assert.equal(state.usage.cache_read_input_tokens, 27776);
  assert.equal(state.usage.reasoning_tokens, 69);
  assert.equal(state.usage.input_tokens, 317988 - 27776);
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.cache_read_input_tokens, 27776);
  assert.equal(delta.usage.reasoning_tokens, 69);
});

test("openai-to-claude keeps message_start seed when finish usage is zero", () => {
  const state = {
    messageStartSent: true,
    messageId: "msg_zero",
    model: "glm-5.3-flash",
    nextBlockIndex: 1,
    textBlockStarted: false,
    textBlockClosed: true,
    thinkingBlockStarted: false,
    toolCalls: new Map(),
    usage: { input_tokens: 0, output_tokens: 0 },
    promptUsageSeed: { input_tokens: 209000 },
    forcePromptUsageSeed: false,
  };
  const events = openaiToClaudeResponse(
    {
      id: "chatcmpl-2",
      model: "glm-5.3-flash",
      choices: [{ finish_reason: "tool_calls", delta: {} }],
    },
    state
  );
  const delta = events.find((e) => e.type === "message_delta");
  assert.equal(delta.usage.input_tokens, 209000);
});
