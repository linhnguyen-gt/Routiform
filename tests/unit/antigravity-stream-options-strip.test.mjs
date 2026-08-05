import test from "node:test";
import assert from "node:assert/strict";

const { openaiToAntigravityRequest } =
  await import("../../open-sse/translator/request/openai-to-gemini.ts");
const { buildAntigravityRequest } =
  await import("../../open-sse/executors/antigravity/request-transform.ts");

// D4 verification, pinned as a regression guard: a client's `stream_options`
// never reaches the Antigravity (Cloud Code) wire, so no strip is needed. The
// OpenAI→Antigravity translator builds a fresh envelope, and the passthrough
// spread in buildAntigravityRequest therefore has nothing to carry it in. If a
// future refactor starts spreading the client body, this test fails first.

const OPENAI_BODY = {
  model: "placeholder",
  messages: [{ role: "user", content: "hi" }],
  stream: true,
  stream_options: { include_usage: true },
};

const CREDENTIALS = { projectId: "test-project" };

for (const model of ["gemini-3-pro", "claude-sonnet-4.5"]) {
  test(`stream_options never reaches the Antigravity wire (${model})`, async () => {
    const envelope = openaiToAntigravityRequest(
      model,
      { ...OPENAI_BODY, model },
      true,
      CREDENTIALS
    );
    assert.ok(!JSON.stringify(envelope).includes("stream_options"));

    const finalBody = await buildAntigravityRequest(model, envelope, CREDENTIALS);
    assert.ok(!(finalBody instanceof Response), "expected a body, not a 422 Response");
    assert.ok(!JSON.stringify(finalBody).includes("stream_options"));
    assert.deepEqual(Object.keys(finalBody).sort(), [
      "model",
      "project",
      "request",
      "requestId",
      "requestType",
      "userAgent",
    ]);
  });
}
