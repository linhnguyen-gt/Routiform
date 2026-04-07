import test from "node:test";
import assert from "node:assert/strict";
const { GithubExecutor } = await import("../../open-sse/executors/github.ts");
const { BaseExecutor } = await import("../../open-sse/executors/base.ts");

function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

const originalFetch = globalThis.fetch;

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("T27: Claude + response_format=json_object injects system instruction and strips response_format field", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [{ role: "user", content: "return json" }],
    response_format: { type: "json_object" },
  };

  const transformed = executor.transformRequest("claude-sonnet-4.5", request, false, {});

  assert.equal(transformed.response_format, undefined);
  assert.equal(transformed.messages[0].role, "system");
  assert.match(
    transformed.messages[0].content,
    /Respond only with valid JSON\. Do not include any text/i
  );
});

test("T27: non-Claude models keep response_format untouched", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [{ role: "user", content: "hello" }],
    response_format: { type: "json_object" },
  };

  const transformed = executor.transformRequest("gpt-4o", request, false, {});
  assert.deepEqual(transformed.response_format, { type: "json_object" });
});

test("T27: SSE [DONE] guard applies only in streaming mode", async () => {
  const executor = new GithubExecutor();
  const originalExecute = BaseExecutor.prototype.execute;

  BaseExecutor.prototype.execute = async () => ({
    response: new Response(
      streamFromChunks(['data: {"delta":"hello"}\n\n', "data: [DONE]\n\n", "data: tail\n\n"]),
      {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }
    ),
    url: "https://api.githubcopilot.com/chat/completions",
  });

  try {
    const streamingResult = await executor.execute({
      model: "claude-sonnet-4.5",
      body: { messages: [] },
      stream: true,
      credentials: { accessToken: "token" },
    });
    const streamingText = await streamingResult.response.text();
    assert.equal(streamingText.includes("data: [DONE]"), false);
    assert.equal(streamingText.includes("data: tail"), true);

    const nonStreamingResult = await executor.execute({
      model: "claude-sonnet-4.5",
      body: { messages: [] },
      stream: false,
      credentials: { accessToken: "token" },
    });
    const nonStreamingText = await nonStreamingResult.response.text();
    assert.equal(nonStreamingText.includes("data: [DONE]"), true);
  } finally {
    BaseExecutor.prototype.execute = originalExecute;
  }
});

test("T27: streaming error responses keep their original body readable", async () => {
  const executor = new GithubExecutor();
  const originalExecute = BaseExecutor.prototype.execute;

  BaseExecutor.prototype.execute = async () => ({
    response: new Response("IDE token expired: unauthorized: token expired\n", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
    url: "https://api.githubcopilot.com/chat/completions",
  });

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4.5",
      body: { messages: [] },
      stream: true,
      credentials: { accessToken: "token" },
    });

    assert.equal(result.response.status, 401);
    assert.equal(await result.response.text(), "IDE token expired: unauthorized: token expired\n");
  } finally {
    BaseExecutor.prototype.execute = originalExecute;
  }
});

test("T27: requests use copilotToken from providerSpecificData when available", async () => {
  globalThis.fetch = async (_url, init = {}) => {
    assert.equal(init.headers.Authorization, "Bearer copilot_test");
    return new Response(
      JSON.stringify({
        choices: [
          { index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const executor = new GithubExecutor();
  const result = await executor.execute({
    model: "gemini-3.1-pro-preview",
    body: { messages: [{ role: "user", content: "Ping" }], stream: false },
    stream: false,
    credentials: {
      accessToken: "ghu_test",
      providerSpecificData: {
        copilotToken: "copilot_test",
      },
    },
  });

  assert.equal(result.response.status, 200);
  assert.match(await result.response.text(), /OK/);
});

test("T27: non-stream execute materializes provider responses before returning", async () => {
  const executor = new GithubExecutor();
  const originalExecute = BaseExecutor.prototype.execute;

  class WeirdResponse {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || "OK";
      this.headers = new Headers(init.headers || {});
      this.bodyUsed = false;
      this.body = {};
    }

    async text() {
      if (this.bodyUsed) {
        throw new TypeError("Response body is already used");
      }
      this.bodyUsed = true;
      return this._body;
    }
  }

  BaseExecutor.prototype.execute = async () => ({
    response: new WeirdResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    url: "https://api.githubcopilot.com/chat/completions",
  });

  try {
    const result = await executor.execute({
      model: "gemini-3.1-pro-preview",
      body: { messages: [{ role: "user", content: "Ping" }], stream: false },
      stream: false,
      credentials: {
        accessToken: "ghu_test",
        providerSpecificData: {
          copilotToken: "copilot_test",
        },
      },
    });

    assert.equal(result.response.constructor.name, "Response");
    assert.equal(await result.response.text(), JSON.stringify({ ok: true }));
  } finally {
    BaseExecutor.prototype.execute = originalExecute;
  }
});

test("T27: needsRefresh respects providerSpecificData copilot token metadata", () => {
  const executor = new GithubExecutor();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  assert.equal(
    executor.needsRefresh({
      accessToken: "ghu_test",
      providerSpecificData: {
        copilotToken: "copilot_test",
        copilotTokenExpiresAt: expiresAt,
      },
    }),
    false
  );
});

test("T27: GitHub Copilot — unknown message parts become text (9router-style sanitize)", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "hi" },
          { type: "thinking", thinking: "internal" },
        ],
      },
    ],
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.messages[0].content.length, 2);
  assert.equal(transformed.messages[0].content[0].type, "text");
  assert.equal(transformed.messages[0].content[1].type, "text");
  assert.match(String(transformed.messages[0].content[1].text), /thinking|internal/i);
});

test("T27: image_url parts are preserved", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "https://example.com/x.png" } },
        ],
      },
    ],
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.messages[0].content[1].type, "image_url");
});

test("T27: assistant with tool_calls and empty string content becomes null content", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
    ],
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.messages[0].content, null);
});

test("T27: consecutive system messages are merged for Copilot", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "hi" },
    ],
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.messages.length, 2);
  assert.equal(transformed.messages[0].role, "system");
  assert.match(String(transformed.messages[0].content), /A/);
  assert.match(String(transformed.messages[0].content), /B/);
});

test("T27: stream_options stripped for Copilot compatibility", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [{ role: "user", content: "x" }],
    stream_options: { include_usage: true },
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.stream_options, undefined);
});

test("T27: parallel_tool_calls, metadata, user stripped for Copilot compatibility", () => {
  const executor = new GithubExecutor();
  const request = {
    messages: [{ role: "user", content: "x" }],
    parallel_tool_calls: true,
    metadata: { foo: "bar" },
    user: "end-user-id",
  };
  const transformed = executor.transformRequest("claude-haiku-4.5", request, true, {});
  assert.equal(transformed.parallel_tool_calls, undefined);
  assert.equal(transformed.metadata, undefined);
  assert.equal(transformed.user, undefined);
});

test("T27: execute logs GITHUB_400 with request size and response peek", async () => {
  const executor = new GithubExecutor();
  const originalExecute = BaseExecutor.prototype.execute;
  const warns = [];

  BaseExecutor.prototype.execute = async () => ({
    response: new Response("Bad Request\n", {
      status: 400,
      headers: { "content-type": "text/plain", "x-request-id": "req-1" },
    }),
    url: "https://api.githubcopilot.com/chat/completions",
    transformedBody: { model: "claude-haiku-4.5", messages: [{ role: "user", content: "hi" }] },
  });

  try {
    await executor.execute({
      model: "claude-haiku-4.5",
      body: { messages: [] },
      stream: false,
      credentials: { accessToken: "token" },
      log: {
        warn: (tag, msg) => {
          warns.push({ tag, msg });
        },
      },
    });
  } finally {
    BaseExecutor.prototype.execute = originalExecute;
  }

  const g400 = warns.find((w) => w.tag === "GITHUB_400");
  assert.ok(g400, "expected GITHUB_400 warn");
  assert.match(g400.msg, /requestBodyBytes≈/);
  assert.match(g400.msg, /Bad Request/);
  assert.match(g400.msg, /x-request-id/);
});
