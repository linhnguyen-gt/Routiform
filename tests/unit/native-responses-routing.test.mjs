import test from "node:test";
import assert from "node:assert/strict";

const { CodexExecutor } = await import("../../open-sse/executors/codex.ts");
const { shouldUseNativeResponsesPath } =
  await import("../../open-sse/handlers/responsesHandler.ts");

const originalFetch = globalThis.fetch;

function sseResponse() {
  return new Response(
    'data: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[]}}\n\n',
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }
  );
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("native Responses path is selected for explicit openai-responses targets", () => {
  assert.equal(
    shouldUseNativeResponsesPath({
      provider: "github",
      model: "gpt-5.2-codex",
      targetFormat: "openai-responses",
    }),
    true
  );
});

test("native Responses path is selected for Codex provider by default", () => {
  assert.equal(shouldUseNativeResponsesPath({ provider: "codex", model: "gpt-5.4" }), true);
});

test("native Codex passthrough preserves Responses fields in outbound body", async () => {
  const executor = new CodexExecutor();
  let capturedBody = null;

  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return sseResponse();
  };

  const requestBody = {
    _nativeCodexPassthrough: true,
    model: "gpt-5.4",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] }],
    previous_response_id: "resp_previous",
    include: ["reasoning.encrypted_content"],
    background: true,
    metadata: { route: "native-responses-test" },
    tools: [{ type: "web_search_preview", search_context_size: "medium" }],
    tool_choice: "auto",
    max_tool_calls: 2,
    parallel_tool_calls: true,
    text: { format: { type: "text" } },
    messages: [{ role: "user", content: "should be stripped" }],
  };

  const result = await executor.execute({
    model: "gpt-5.4",
    body: requestBody,
    stream: true,
    credentials: {
      accessToken: "test-access-token",
      providerSpecificData: {},
      requestEndpointPath: "/v1/responses",
    },
    signal: undefined,
    log: null,
    extendedContext: false,
    upstreamExtraHeaders: undefined,
  });

  assert.equal(result.response.status, 200);
  assert.ok(capturedBody);
  assert.ok(Array.isArray(capturedBody.input), "Responses input should be preserved");
  assert.equal(capturedBody.messages, undefined, "Chat messages must not be sent upstream");
  assert.equal(capturedBody.previous_response_id, "resp_previous");
  assert.deepEqual(capturedBody.include, ["reasoning.encrypted_content"]);
  assert.equal(capturedBody.background, true);
  assert.deepEqual(capturedBody.metadata, { route: "native-responses-test" });
  assert.deepEqual(capturedBody.tools, [
    { type: "web_search_preview", search_context_size: "medium" },
  ]);
  assert.equal(capturedBody.tool_choice, "auto");
  assert.equal(capturedBody.max_tool_calls, 2);
  assert.equal(capturedBody.parallel_tool_calls, true);
  assert.deepEqual(capturedBody.text, { format: { type: "text" } });
});

test("translated Codex path keeps existing previous_response_id stripping behavior", () => {
  const executor = new CodexExecutor();
  const transformed = executor.transformRequest(
    "gpt-5.4",
    {
      model: "gpt-5.4",
      input: [{ type: "message", role: "user", content: "hello" }],
      previous_response_id: "resp_previous",
    },
    true,
    { providerSpecificData: {} }
  );

  assert.equal(transformed.previous_response_id, undefined);
});
