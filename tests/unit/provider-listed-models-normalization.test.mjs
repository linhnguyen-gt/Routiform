import test from "node:test";
import assert from "node:assert/strict";

const normalization =
  await import("../../src/app/api/providers/[id]/models/normalize-provider-listed-models.ts");

test("normalizeProviderListedModels maps OpenRouter-style context and output limits", () => {
  const [model] = normalization.normalizeProviderListedModels([
    {
      id: "openai/gpt-4.1",
      name: "GPT-4.1",
      context_length: 1_048_576,
      top_provider: {
        max_completion_tokens: 32_768,
      },
    },
  ]);

  assert.equal(model.inputTokenLimit, 1_048_576);
  assert.equal(model.outputTokenLimit, 32_768);
});

test("normalizeProviderListedModels maps nested provider limits", () => {
  const [model] = normalization.normalizeProviderListedModels([
    {
      id: "llama3.3-70b",
      limits: {
        max_context_length: 131_072,
        max_completion_tokens: 8_192,
      },
    },
  ]);

  assert.equal(model.inputTokenLimit, 131_072);
  assert.equal(model.outputTokenLimit, 8_192);
});

test("normalizeProviderListedModels preserves explicit token limit fields", () => {
  const [model] = normalization.normalizeProviderListedModels([
    {
      id: "gemini-2.5-pro",
      inputTokenLimit: 2_097_152,
      outputTokenLimit: 65_536,
    },
  ]);

  assert.equal(model.inputTokenLimit, 2_097_152);
  assert.equal(model.outputTokenLimit, 65_536);
});
