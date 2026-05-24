import test from "node:test";
import assert from "node:assert/strict";

const { CloudflareAIExecutor } = await import("../../open-sse/executors/cloudflare-ai.ts");
const { toJsonErrorPayload } = await import("../../src/shared/utils/upstreamError.ts");

test("Cloudflare executor flattens text-only content part arrays into plain strings", () => {
  const executor = new CloudflareAIExecutor();
  const body = {
    model: "@cf/meta/llama-3.1-8b-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Hello " },
          { type: "input_text", text: "Cloudflare" },
        ],
      },
    ],
  };

  const transformed = executor.transformRequest(body.model, body, true, {});

  assert.equal(transformed.messages[0].content, "Hello Cloudflare");
  assert.notEqual(transformed, body);
});

test("Cloudflare executor preserves mixed multimodal content arrays", () => {
  const executor = new CloudflareAIExecutor();
  const body = {
    model: "@cf/meta/llama-3.1-8b-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
        ],
      },
    ],
  };

  const transformed = executor.transformRequest(body.model, body, true, {});

  assert.deepEqual(transformed, body);
});

test("toJsonErrorPayload normalizes Cloudflare nested error envelopes", () => {
  const payload = toJsonErrorPayload({
    success: false,
    errors: [{ code: 7003, message: "Could not route to /accounts/abc/ai/v1/chat/completions" }],
    messages: [{ code: 10000, message: "Authentication error" }],
  });

  assert.deepEqual(payload, {
    error: {
      message: "Could not route to /accounts/abc/ai/v1/chat/completions",
      type: "api_error",
      code: "7003",
      details: {
        provider: "cloudflare-ai",
        success: false,
        errors: [
          { code: "7003", message: "Could not route to /accounts/abc/ai/v1/chat/completions" },
        ],
        messages: [{ code: "10000", message: "Authentication error" }],
      },
    },
  });
});

test("toJsonErrorPayload normalizes stringified Cloudflare error envelopes", () => {
  const payload = toJsonErrorPayload(
    JSON.stringify({
      error: {
        success: false,
        errors: [{ code: 7000, message: "No account id found" }],
      },
    }),
    "Cloudflare request failed"
  );

  assert.equal(payload.error.type, "api_error");
  assert.equal(payload.error.code, "7000");
  assert.equal(payload.error.message, "No account id found");
  assert.equal(payload.error.details.provider, "cloudflare-ai");
});
