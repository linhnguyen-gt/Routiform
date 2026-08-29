import test from "node:test";
import assert from "node:assert/strict";

// Anthropic `input_tokens` is cache-EXCLUSIVE; OpenAI `prompt_tokens` is
// cache-INCLUSIVE. filterUsageForFormat must not copy one onto the other
// without peeling/adding cache, or Claude Code double-counts cache_read
// (context % inflated) and OpenAI clients undercount prompt tokens.
const { filterUsageForFormat } = await import("../../open-sse/utils/usageTracking.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.ts");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const INCLUSIVE = 9000;
const EXCLUSIVE = 3000;
const CACHE_READ = 1000;
const CACHE_CREATE = 5000;
const OUTPUT = 500;

function claudeFields(usage) {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
  };
}

test("filterUsageForFormat CLAUDE peels cache off inclusive prompt_tokens", () => {
  const usage = filterUsageForFormat(
    {
      prompt_tokens: INCLUSIVE,
      completion_tokens: OUTPUT,
      cache_read_input_tokens: CACHE_READ,
      cache_creation_input_tokens: CACHE_CREATE,
    },
    FORMATS.CLAUDE
  );

  assert.deepEqual(claudeFields(usage), {
    input_tokens: EXCLUSIVE,
    output_tokens: OUTPUT,
    cache_read_input_tokens: CACHE_READ,
    cache_creation_input_tokens: CACHE_CREATE,
  });
});

test("filterUsageForFormat CLAUDE peels cache from prompt_tokens_details", () => {
  const usage = filterUsageForFormat(
    {
      prompt_tokens: INCLUSIVE,
      completion_tokens: OUTPUT,
      prompt_tokens_details: {
        cached_tokens: CACHE_READ,
        cache_creation_tokens: CACHE_CREATE,
      },
    },
    FORMATS.CLAUDE
  );

  assert.deepEqual(claudeFields(usage), {
    input_tokens: EXCLUSIVE,
    output_tokens: OUTPUT,
    cache_read_input_tokens: CACHE_READ,
    cache_creation_input_tokens: CACHE_CREATE,
  });
});

test("filterUsageForFormat CLAUDE keeps already-exclusive input_tokens", () => {
  const usage = filterUsageForFormat(
    {
      input_tokens: EXCLUSIVE,
      output_tokens: OUTPUT,
      cache_read_input_tokens: CACHE_READ,
      cache_creation_input_tokens: CACHE_CREATE,
      prompt_tokens: INCLUSIVE,
    },
    FORMATS.CLAUDE
  );

  assert.equal(usage.input_tokens, EXCLUSIVE);
  assert.equal(usage.cache_read_input_tokens, CACHE_READ);
  assert.equal(usage.cache_creation_input_tokens, CACHE_CREATE);
});

test("filterUsageForFormat CLAUDE copies prompt_tokens when there is no cache", () => {
  const usage = filterUsageForFormat({ prompt_tokens: 120, completion_tokens: 8 }, FORMATS.CLAUDE);
  assert.equal(usage.input_tokens, 120);
  assert.equal(usage.output_tokens, 8);
});

test("filterUsageForFormat CLAUDE does not go negative when cache exceeds prompt", () => {
  const usage = filterUsageForFormat(
    {
      prompt_tokens: 10,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 5,
    },
    FORMATS.CLAUDE
  );
  assert.equal(usage.input_tokens, 0);
});

test("filterUsageForFormat OPENAI_RESPONSES keeps prompt_tokens cache-inclusive", () => {
  const usage = filterUsageForFormat(
    {
      prompt_tokens: INCLUSIVE,
      completion_tokens: OUTPUT,
      cache_read_input_tokens: CACHE_READ,
      cache_creation_input_tokens: CACHE_CREATE,
    },
    FORMATS.OPENAI_RESPONSES
  );

  assert.equal(usage.input_tokens, INCLUSIVE);
  assert.equal(usage.output_tokens, OUTPUT);
});

test("filterUsageForFormat OPENAI adds cache onto exclusive input_tokens", () => {
  const usage = filterUsageForFormat(
    {
      input_tokens: EXCLUSIVE,
      output_tokens: OUTPUT,
      cache_read_input_tokens: CACHE_READ,
      cache_creation_input_tokens: CACHE_CREATE,
    },
    FORMATS.OPENAI
  );

  assert.equal(usage.prompt_tokens, INCLUSIVE);
  assert.equal(usage.completion_tokens, OUTPUT);
  assert.equal(usage.total_tokens, INCLUSIVE + OUTPUT);
});

test("filterUsageForFormat OPENAI does not re-add cache when prompt_tokens already inclusive", () => {
  const usage = filterUsageForFormat(
    {
      prompt_tokens: INCLUSIVE,
      completion_tokens: OUTPUT,
      cache_read_input_tokens: CACHE_READ,
      cache_creation_input_tokens: CACHE_CREATE,
    },
    FORMATS.OPENAI
  );

  assert.equal(usage.prompt_tokens, INCLUSIVE);
  assert.equal(usage.total_tokens, INCLUSIVE + OUTPUT);
});

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

function parseClaudeUsageEvents(sse) {
  return sse
    .split("\n")
    .filter((line) => line.startsWith("data:") && line.includes('"usage"'))
    .map((line) => JSON.parse(line.slice(5).trim()))
    .filter((event) => event.usage);
}

// Usage arrives on an empty-choices OpenAI chunk (common include_usage
// frame). Finish chunk has no usage. Stream injects filterUsageForFormat
// over the OpenAI-shaped accumulator onto Claude message_delta.
test("E2E OpenAI->Claude: cache-inclusive prompt_tokens become exclusive input_tokens", async () => {
  const stream = createSSETransformStreamWithLogger(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "openai",
    null,
    null,
    "gpt-4o",
    "conn-claude-usage-1",
    { messages: [{ role: "user", content: "hi" }] },
    null,
    null
  );

  const output = await driveStream(stream, [
    'data: {"id":"chatcmpl_u","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"}}]}\n\n',
    `data: {"id":"chatcmpl_u","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":${INCLUSIVE},"completion_tokens":${OUTPUT},"prompt_tokens_details":{"cached_tokens":${CACHE_READ},"cache_creation_tokens":${CACHE_CREATE}}}}\n\n`,
    'data: {"id":"chatcmpl_u","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  ]);

  const messageDelta = parseClaudeUsageEvents(output).find(
    (event) => event.type === "message_delta"
  );
  assert.ok(messageDelta, "expected Claude message_delta carrying usage");

  // Buffer (default 2000) only adds to the exclusive field, never folds cache
  // into it. Inclusive copy would be 9000..11000.
  assert.ok(
    messageDelta.usage.input_tokens >= EXCLUSIVE && messageDelta.usage.input_tokens < INCLUSIVE,
    `expected exclusive input_tokens (3000..8999), got ${messageDelta.usage.input_tokens}`
  );
  assert.equal(messageDelta.usage.cache_read_input_tokens, CACHE_READ);
  assert.equal(messageDelta.usage.cache_creation_input_tokens, CACHE_CREATE);
  assert.ok(
    messageDelta.usage.input_tokens + CACHE_READ + CACHE_CREATE >= INCLUSIVE,
    "Claude Code total (input + cache) must still cover the original prompt"
  );
});
