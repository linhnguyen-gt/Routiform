import test from "node:test";
import assert from "node:assert/strict";

test("inferModelFamily correctly detects common families", async () => {
  const { inferModelFamily, inferParameterSize, inferModelDetails } =
    await import("../../src/lib/ollama/models.ts");

  assert.equal(inferModelFamily("llama3.2:3b"), "llama");
  assert.equal(inferModelFamily("qwen2.5-coder:7b"), "qwen");
  assert.equal(inferModelFamily("deepseek-r1:70b"), "deepseek");
  assert.equal(inferModelFamily("mistral-small3.2:24b"), "mistral");
  assert.equal(inferModelFamily("gemma3:27b"), "gemma");
  assert.equal(inferModelFamily("claude-3-7-sonnet"), "claude");
  assert.equal(inferModelFamily("gpt-4o"), "gpt");
  assert.equal(inferModelFamily("gemini-2.5-flash"), "gemini");

  assert.equal(inferParameterSize("llama3.2:3b"), "3B");
  assert.equal(inferParameterSize("llama3.3:70b"), "70B");
  assert.equal(inferParameterSize("mixtral-8x7b"), "8x7B");

  const details = inferModelDetails("qwen3:72b");
  assert.equal(details.format, "gguf");
  assert.equal(details.family, "qwen");
  assert.equal(details.parameter_size, "72B");
  assert.equal(details.quantization_level, "Q4_K_M");
});

test("GET /api/tags returns dynamic models in Ollama format", async () => {
  const { GET } = await import("../../src/app/api/tags/route.ts");

  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");

  const data = await response.json();
  assert.ok(Array.isArray(data.models));
  assert.ok(data.models.length > 0);

  const first = data.models[0];
  assert.ok(first.name);
  assert.ok(first.model);
  assert.ok(first.modified_at);
  assert.ok(typeof first.size === "number");
  assert.ok(first.digest);
  assert.ok(first.details);
  assert.equal(first.details.format, "gguf");
});

test("GET /api/version returns Ollama version", async () => {
  const { GET } = await import("../../src/app/api/version/route.ts");

  const response = await GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.version);
  assert.match(data.version, /^\d+\.\d+\.\d+/);
});

test("GET /api/ps returns running models array", async () => {
  const { GET } = await import("../../src/app/api/ps/route.ts");

  const response = await GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Array.isArray(data.models));
});

test("POST /api/show returns model details according to Ollama spec", async () => {
  const { POST } = await import("../../src/app/api/show/route.ts");

  const req = new Request("http://localhost:20128/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemma4:27b" }),
  });

  const response = await POST(req);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.details);
  assert.equal(data.details.family, "gemma");
  assert.equal(data.details.parameter_size, "27B");
  assert.ok(Array.isArray(data.capabilities));
  assert.ok(data.capabilities.includes("completion"));
});

test("transformToOllama handles non-streaming responses", async () => {
  const { transformToOllama } = await import("../../open-sse/utils/ollamaTransform.ts");

  const openAiJson = {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: 1700000000,
    model: "llama3.2",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "Hello from test!",
          reasoning_content: "Thinking step 1",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };

  const mockResponse = new Response(JSON.stringify(openAiJson), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const transformed = await transformToOllama(mockResponse, "llama3.2", false);
  assert.equal(transformed.status, 200);
  assert.equal(transformed.headers.get("content-type"), "application/json");

  const data = await transformed.json();
  assert.equal(data.model, "llama3.2");
  assert.equal(data.message.role, "assistant");
  assert.equal(data.message.content, "Hello from test!");
  assert.equal(data.message.thinking, "Thinking step 1");
  assert.equal(data.done, true);
  assert.equal(data.done_reason, "stop");
  assert.equal(data.prompt_eval_count, 10);
  assert.equal(data.eval_count, 5);
});

test("transformToOllamaGenerate handles non-streaming generate responses", async () => {
  const { transformToOllamaGenerate } = await import("../../open-sse/utils/ollamaTransform.ts");

  const openAiJson = {
    id: "chatcmpl-456",
    object: "chat.completion",
    created: 1700000000,
    model: "deepseek-r1",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "Generated answer text",
          reasoning_content: "Step by step thinking",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  };

  const mockResponse = new Response(JSON.stringify(openAiJson), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const transformed = await transformToOllamaGenerate(mockResponse, "deepseek-r1", false);
  assert.equal(transformed.status, 200);
  assert.equal(transformed.headers.get("content-type"), "application/json");

  const data = await transformed.json();
  assert.equal(data.model, "deepseek-r1");
  assert.equal(data.response, "Generated answer text");
  assert.equal(data.thinking, "Step by step thinking");
  assert.equal(data.done, true);
  assert.equal(data.prompt_eval_count, 12);
  assert.equal(data.eval_count, 8);
});

test("ollama-cloud model URL in provider-models-config-part-b2 is https://ollama.com/v1/models", async () => {
  const { providerModelsConfigPartB2 } =
    await import("../../src/app/api/providers/[id]/models/provider-models-config-part-b2.ts");

  const ollamaCloudConfig = providerModelsConfigPartB2["ollama-cloud"];
  assert.ok(ollamaCloudConfig);
  assert.equal(ollamaCloudConfig.url, "https://ollama.com/v1/models");
  assert.notEqual(ollamaCloudConfig.url, "https://api.ollama.com/v1/models");
});

test("transformToOllama handles streaming SSE responses with thinking and content", async () => {
  const { transformToOllama } = await import("../../open-sse/utils/ollamaTransform.ts");

  const sseData =
    [
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking first"}}]}',
      'data: {"choices":[{"delta":{"content":"Answer text"}}]}',
      "data: [DONE]",
    ].join("\n\n") + "\n\n";

  const mockResponse = new Response(sseData, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

  const transformed = await transformToOllama(mockResponse, "test-stream-model", true);
  assert.equal(transformed.status, 200);
  assert.equal(transformed.headers.get("content-type"), "application/x-ndjson");

  const text = await transformed.text();
  const lines = text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(lines.length >= 2);

  const thinkingChunk = lines.find((l) => l.message?.thinking === "Thinking first");
  assert.ok(thinkingChunk);
  assert.equal(thinkingChunk.done, false);

  const contentChunk = lines.find((l) => l.message?.content === "Answer text");
  assert.ok(contentChunk);
  assert.equal(contentChunk.done, false);

  const lastChunk = lines[lines.length - 1];
  assert.equal(lastChunk.done, true);
});

test("transformToOllamaGenerate handles streaming SSE responses", async () => {
  const { transformToOllamaGenerate } = await import("../../open-sse/utils/ollamaTransform.ts");

  const sseData =
    [
      'data: {"choices":[{"delta":{"content":"Generated chunk 1"}}]}',
      'data: {"choices":[{"delta":{"content":" chunk 2"}}]}',
      "data: [DONE]",
    ].join("\n\n") + "\n\n";

  const mockResponse = new Response(sseData, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

  const transformed = await transformToOllamaGenerate(mockResponse, "gen-model", true);
  assert.equal(transformed.status, 200);
  assert.equal(transformed.headers.get("content-type"), "application/x-ndjson");

  const text = await transformed.text();
  const lines = text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(lines.length >= 2);

  const firstChunk = lines.find((l) => l.response === "Generated chunk 1");
  assert.ok(firstChunk);
  assert.equal(firstChunk.done, false);

  const lastChunk = lines[lines.length - 1];
  assert.equal(lastChunk.done, true);
});
