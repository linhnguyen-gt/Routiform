import test from "node:test";
import assert from "node:assert/strict";

import { initChatCorePipeline } from "../../open-sse/handlers/chat-core/chat-core-pipeline.ts";

test("chat core preserves requestedModelOverride when body.model is rewritten for execution", () => {
  const pipeline = initChatCorePipeline({
    body: { model: "antigravity/gemini-3.1-pro-low", messages: [] },
    modelInfo: { provider: "antigravity", model: "gemini-3.1-pro-low" },
    requestedModelOverride: "antigravity/gemini-pro-agent",
    credentials: {},
  });

  assert.equal(pipeline.requestedModel, "antigravity/gemini-pro-agent");
  assert.equal(pipeline.model, "gemini-3.1-pro-low");
});
