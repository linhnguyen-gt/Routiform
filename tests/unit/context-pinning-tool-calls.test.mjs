import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  injectModelTag,
  extractPinnedModel,
} from "../../open-sse/services/comboAgentMiddleware.ts";

// Behavior change (plan 260531-1214-request-dedupe Phase 4):
// injectModelTag NO LONGER appends a synthetic assistant message when the
// last assistant message is non-string (tool_calls / content array) or when
// no assistant message exists. The synthetic-append fallback caused duplicate
// assistant bubbles in clients like the OpenClaw control UI. The X-Routiform-
// Model HTTP header now carries the pin signal in those cases.
describe("Context pinning — tool call responses (#721, post-Phase-4)", () => {
  test("injectModelTag DOES NOT append synthetic message when last assistant has null content (tool_calls)", () => {
    const messages = [
      { role: "user", content: "List the files" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: { name: "read", arguments: '{"filePath":"/mnt/e/deer-flow"}' },
          },
        ],
      },
    ];

    const result = injectModelTag(messages, "ollamacloud/glm-5");

    // No synthetic append — pin in-message is skipped, header path takes over.
    assert.equal(result.length, 2, "Should keep original 2 messages, no synthetic append");
    // Last assistant unchanged (still tool_calls only, content stays null).
    assert.equal(result[1].content, null);
    // No <routiformModel> tag is materialized into messages[].
    const anyTag = result.some(
      (m) => typeof m.content === "string" && m.content.includes("<routiformModel>")
    );
    assert.equal(anyTag, false, "No tag should appear in messages with non-string assistant tail");
  });

  test("injectModelTag DOES NOT append synthetic when last assistant has array content", () => {
    const messages = [
      { role: "user", content: "Explain the code" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the analysis" },
          { type: "text", text: "And here is part 2" },
        ],
      },
    ];

    const result = injectModelTag(messages, "nvidia/llama-3.4-70b");

    assert.equal(result.length, 2, "No synthetic append for array-content assistant");
    assert.deepEqual(result[1].content, [
      { type: "text", text: "Here is the analysis" },
      { type: "text", text: "And here is part 2" },
    ]);
  });

  test("injectModelTag DOES NOT append synthetic when no assistant message exists", () => {
    const messages = [{ role: "user", content: "first turn" }];

    const result = injectModelTag(messages, "openai/gpt-4o");

    assert.equal(result.length, 1, "No synthetic append on first turn (header pin only)");
    assert.equal(result[0].role, "user");
  });

  test("injectModelTag still appends to assistant string content (happy path)", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const result = injectModelTag(messages, "openai/gpt-4o");

    assert.equal(result.length, 2, "Should not add a new message");
    assert.ok(result[1].content.includes("<routiformModel>openai/gpt-4o</routiformModel>"));
    assert.ok(result[1].content.startsWith("Hi there!"));
  });

  test("extractPinnedModel returns null when only tool_calls assistant exists", () => {
    const messages = [
      { role: "user", content: "List the files" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_abc", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
    ];

    const pinned = extractPinnedModel(messages);
    assert.equal(pinned, null);
  });

  test("roundtrip on string-content assistant: inject → extract still works", () => {
    const messages = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello." },
    ];

    const tagged = injectModelTag(messages, "qwen/coder-model");
    const pinned = extractPinnedModel(tagged);

    assert.equal(pinned, "qwen/coder-model");
  });

  test("re-injection on string assistant clears old pin and sets new one", () => {
    const messages = [
      { role: "user", content: "Follow up" },
      { role: "assistant", content: "Previous answer\n<routiformModel>old/model</routiformModel>" },
    ];

    const tagged = injectModelTag(messages, "new/model");
    const pinned = extractPinnedModel(tagged);

    assert.equal(pinned, "new/model");
    const oldTagPresent = tagged.some(
      (m) => typeof m.content === "string" && m.content.includes("old/model")
    );
    assert.equal(oldTagPresent, false);
  });
});
