import test from "node:test";
import assert from "node:assert/strict";

import { QoderExecutor } from "../../open-sse/executors/qoder.ts";
import {
  buildQoderPrompt,
  getStaticQoderModels,
  mapQoderModelToLevel,
  normalizeQoderPatProviderData,
  parseQoderCliFailure,
  validateQoderCliPat,
} from "../../open-sse/services/qoderCli.ts";

test("QoderExecutor: constructor sets provider to qoder", () => {
  const executor = new QoderExecutor();
  assert.equal(executor.getProvider(), "qoder");
});

test("QoderExecutor: buildHeaders merges provider config, auth, and stream Accept", () => {
  const executor = new QoderExecutor();
  assert.deepEqual(executor.buildHeaders({ apiKey: "pat" }, true), {
    "Content-Type": "application/json",
    "User-Agent": "Qoder-Cli",
    Authorization: "Bearer pat",
    Accept: "text/event-stream",
  });
  assert.deepEqual(executor.buildHeaders({ apiKey: "pat" }, false), {
    "Content-Type": "application/json",
    "User-Agent": "Qoder-Cli",
    Authorization: "Bearer pat",
  });
});

test("QoderExecutor: buildUrl uses the live qoder.com API base", () => {
  const executor = new QoderExecutor();
  assert.equal(
    executor.buildUrl("qoder-rome-30ba3b", false),
    "https://api.qoder.com/v1/chat/completions"
  );
});

test("normalizeQoderPatProviderData forces PAT + qodercli transport", () => {
  assert.deepEqual(normalizeQoderPatProviderData({ region: "sa-east-1" }), {
    region: "sa-east-1",
    authMode: "pat",
    transport: "qodercli",
  });
});

test("mapQoderModelToLevel maps static models to qodercli levels", () => {
  assert.equal(mapQoderModelToLevel("qoder-rome-30ba3b"), "qmodel");
  assert.equal(mapQoderModelToLevel("deepseek-r1"), "ultimate");
  assert.equal(mapQoderModelToLevel("qwen3-max"), "performance");
  assert.equal(mapQoderModelToLevel(""), null);
});

test("getStaticQoderModels exposes the static if/* catalog seed", () => {
  const models = getStaticQoderModels();
  assert.ok(models.some((model) => model.id === "qoder-rome-30ba3b"));
  assert.ok(models.some((model) => model.id === "deepseek-r1"));
});

test("buildQoderPrompt flattens transcript and warns against local tools", () => {
  const prompt = buildQoderPrompt({
    messages: [
      { role: "system", content: "Follow the user request." },
      {
        role: "user",
        content: [{ type: "text", text: "Reply with OK." }],
      },
      {
        role: "assistant",
        tool_calls: [
          {
            type: "function",
            function: { name: "pwd", arguments: "{}" },
          },
        ],
        content: "",
      },
    ],
    tools: [{ type: "function", function: { name: "pwd" } }],
  });

  assert.match(prompt, /Conversation transcript:/);
  assert.match(prompt, /USER:\nReply with OK\./);
  assert.match(prompt, /TOOL_CALL pwd: \{\}/);
  assert.match(prompt, /Do not call those tools yourself\./);
});

test("parseQoderCliFailure classifies auth, runtime and timeout failures", () => {
  assert.deepEqual(parseQoderCliFailure("Invalid API key"), {
    status: 401,
    message: "Invalid API key",
    code: "upstream_auth_error",
  });
  assert.deepEqual(parseQoderCliFailure("command not found: qodercli"), {
    status: 503,
    message: "command not found: qodercli",
    code: "runtime_error",
  });
  assert.deepEqual(parseQoderCliFailure("request timed out"), {
    status: 504,
    message: "request timed out",
    code: "timeout",
  });
});

test("validateQoderCliPat succeeds when remote validation returns OK", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "",
  });

  try {
    const result = await validateQoderCliPat({ apiKey: "pat_test" });
    assert.deepEqual(result, { valid: true, error: null, unsupported: false });
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("validateQoderCliPat returns invalid when remote validation fails", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "Invalid API key",
  });

  try {
    const result = await validateQoderCliPat({ apiKey: "pat_bad" });
    assert.equal(result.valid, false);
    assert.equal(result.unsupported, false);
    assert.match(result.error, /401/);
    assert.match(result.error, /Invalid API key/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("QoderExecutor: non-stream calls return upstream JSON payload", async () => {
  const prevFetch = globalThis.fetch;
  const upstreamPayload = {
    id: "chatcmpl-mock",
    object: "chat.completion",
    choices: [
      {
        message: { role: "assistant", content: "OK" },
        finish_reason: "stop",
      },
    ],
  };

  globalThis.fetch = async (fetchUrl, init) => {
    assert.equal(fetchUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.ok(body.messages);
    return new Response(JSON.stringify(upstreamPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const executor = new QoderExecutor();
    const { response, url } = await executor.execute({
      model: "qoder-rome-30ba3b",
      body: { messages: [{ role: "user", content: "Reply with OK only." }] },
      stream: false,
      credentials: { apiKey: "pat_test" },
    });

    assert.equal(url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.object, "chat.completion");
    assert.equal(payload.choices[0].message.role, "assistant");
    assert.equal(payload.choices[0].message.content, "OK");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("QoderExecutor: stream calls pass through upstream SSE body", async () => {
  const prevFetch = globalThis.fetch;
  const sseLines = [
    'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}',
    'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":"O"}}]}',
    'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":"K"}}]}',
    "data: [DONE]",
    "",
  ].join("\n");

  globalThis.fetch = async () =>
    new Response(sseLines, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

  try {
    const executor = new QoderExecutor();
    const { response } = await executor.execute({
      model: "qoder-rome-30ba3b",
      body: { messages: [{ role: "user", content: "Reply with OK only." }] },
      stream: true,
      credentials: { apiKey: "pat_test" },
    });

    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /chat\.completion\.chunk/);
    assert.match(body, /"role":"assistant"/);
    assert.match(body, /"content":"O"/);
    assert.match(body, /"content":"K"/);
    assert.match(body, /\[DONE\]/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
