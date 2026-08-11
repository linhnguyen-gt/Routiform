import test from "node:test";
import assert from "node:assert/strict";

const { sanitizeAnthropicThinkingPayload } =
  await import("../../open-sse/translator/helpers/claudeHelper.ts");

test("sanitizeAnthropicThinkingPayload maps adaptive to enabled and adds budget_tokens", () => {
  const body = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
  };
  sanitizeAnthropicThinkingPayload(body);
  assert.equal(body.thinking.type, "enabled");
  assert.ok(typeof body.thinking.budget_tokens === "number");
  assert.ok(body.thinking.budget_tokens > 0);
  assert.ok(body.max_tokens > body.thinking.budget_tokens);
});

test("sanitizeAnthropicThinkingPayload leaves disabled thinking unchanged", () => {
  const body = { thinking: { type: "disabled" } };
  sanitizeAnthropicThinkingPayload(body);
  assert.deepEqual(body.thinking, { type: "disabled" });
});

// ─── Cross-attempt isolation ────────────────────────────────────────────────
// The combo fallback loop and the credential retry loop reuse ONE client body
// for every attempt, re-spreading only its top level. `sanitizeAnthropicThinking
// Payload` writes into the nested `thinking` object, so the inbound translator
// has to copy it — otherwise attempt N+1 reads attempt N's clamped budget.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-thinking-alias-"));

const { translateInboundRequestBody } = await import(
  "../../open-sse/handlers/chat-core/chat-core-translate-inbound-body.ts"
);

const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** One attempt, mirroring `chat.ts:836`'s `{ ...body, model }` top-level spread. */
async function claudePassthroughAttempt(clientBody, provider, model) {
  const result = await translateInboundRequestBody({
    nativeCodexPassthrough: false,
    isClaudeCodeCompatible: false,
    isClaudePassthrough: true,
    body: { ...clientBody, model: `${provider}/${model}` },
    provider,
    model,
    sourceFormat: "claude",
    targetFormat: "claude",
    stream: false,
    credentials: {},
    reqLogger: silent,
    preserveCacheControl: false,
    log: silent,
    resolvedModel: model,
    upstreamStream: false,
  });
  assert.equal(result.ok, true);
  return result.translatedBody;
}

test("claude passthrough does not mutate the caller's thinking payload", async () => {
  const clientBody = {
    model: "my-combo",
    max_tokens: 100000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: "hi" }],
  };

  const sent = await claudePassthroughAttempt(clientBody, "anthropic", "claude-opus-4-5");

  assert.equal(sent.thinking.type, "enabled", "the wire payload is still normalized");
  assert.deepEqual(
    clientBody.thinking,
    { type: "adaptive" },
    "the client's own object must survive the attempt untouched"
  );
});

test("a second combo attempt sees the client's payload, not the first attempt's", async () => {
  const clientBody = {
    model: "my-combo",
    max_tokens: 100000,
    thinking: { type: "enabled", budget_tokens: 60000 },
    messages: [{ role: "user", content: "hi" }],
  };

  await claudePassthroughAttempt(clientBody, "anthropic", "claude-opus-4-5");
  const second = await claudePassthroughAttempt(clientBody, "anthropic", "claude-sonnet-4-6");

  const control = await claudePassthroughAttempt(
    {
      model: "my-combo",
      max_tokens: 100000,
      thinking: { type: "enabled", budget_tokens: 60000 },
      messages: [{ role: "user", content: "hi" }],
    },
    "anthropic",
    "claude-sonnet-4-6"
  );

  assert.deepEqual(
    second.thinking,
    control.thinking,
    "the fallback model must send what a fresh request would send"
  );
});

test("the model's budget ceiling applies to the provider-qualified body model", async () => {
  // `body.model` carries the `provider/model` form the routing layer stamps on,
  // not the bare id. The ceiling has to survive that shape or it never fires on
  // a real request.
  const clientBody = {
    model: "my-combo",
    max_tokens: 100000,
    thinking: { type: "enabled", budget_tokens: 60000 },
    messages: [{ role: "user", content: "hi" }],
  };

  const sent = await claudePassthroughAttempt(clientBody, "anthropic", "claude-opus-4-5");
  assert.equal(sent.thinking.budget_tokens, 32000, "clamped to claude-opus-4-5's cap");
});

test("an omitted budget picks up the model's own default, not the generic fallback", async () => {
  const clientBody = {
    model: "my-combo",
    max_tokens: 100000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: "hi" }],
  };

  const sent = await claudePassthroughAttempt(clientBody, "anthropic", "claude-opus-4-5");
  assert.equal(sent.thinking.budget_tokens, 10000, "claude-opus-4-5's defaultThinkingBudget");
});
