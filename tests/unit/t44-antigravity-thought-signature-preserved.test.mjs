import test from "node:test";
import assert from "node:assert/strict";

import { AntigravityExecutor } from "../../open-sse/executors/antigravity.ts";

test("T44: Antigravity preserves thoughtSignature for functionCall turns", async () => {
  const executor = new AntigravityExecutor();
  const transformed = await executor.transformRequest(
    "gemini-3-flash",
    {
      request: {
        contents: [
          {
            role: "model",
            parts: [
              { thought: true, text: "internal reasoning" },
              { thoughtSignature: "sig_123" },
              {
                functionCall: {
                  id: "call_1",
                  name: "default_api:memos_load_user_memory",
                  args: { userId: "u1" },
                },
              },
            ],
          },
        ],
        tools: [{ functionDeclarations: [{ name: "default_api:memos_load_user_memory" }] }],
      },
    },
    true,
    { projectId: "test-project" }
  );

  const parts = transformed.request.contents[0].parts;

  assert.equal(
    parts.some((part) => part.thought === true),
    false,
    "thought text should still be stripped before sending to Antigravity"
  );
  assert.equal(
    parts.some((part) => part.thoughtSignature === "sig_123"),
    true,
    "tool-call turns must keep thoughtSignature for Gemini 3+ compatibility"
  );
  assert.equal(
    parts.some((part) => part.functionCall?.name === "default_api:memos_load_user_memory"),
    true,
    "functionCall must still be present"
  );
});

test("T44: Antigravity still strips standalone thoughtSignature without tool calls", async () => {
  const executor = new AntigravityExecutor();
  const transformed = await executor.transformRequest(
    "gemini-3-flash",
    {
      request: {
        contents: [
          {
            role: "model",
            parts: [{ thoughtSignature: "sig_123" }, { text: "plain text" }],
          },
        ],
      },
    },
    true,
    { projectId: "test-project" }
  );

  assert.deepEqual(transformed.request.contents[0].parts, [{ text: "plain text" }]);
});

test("T44: Antigravity passes Gemini Pro High model IDs through to upstream as-is", async () => {
  // Earlier revisions silently downcast `gemini-3.1-pro-high` → `gemini-3.1-pro-low`
  // via PROVIDER_MODEL_ALIASES. That hid quota errors and made test/Health probes
  // hit a different tier than production traffic. The map was removed; the executor
  // now strips only the `antigravity/` provider prefix and forwards the rest.
  const executor = new AntigravityExecutor();
  const transformed = await executor.transformRequest(
    "antigravity/gemini-3.1-pro-high",
    {
      request: {
        contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
      },
    },
    false,
    { projectId: "test-project" }
  );

  assert.equal(transformed.model, "gemini-3.1-pro-high");
});
