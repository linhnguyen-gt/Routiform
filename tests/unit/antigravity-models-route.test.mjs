import test from "node:test";
import assert from "node:assert/strict";

const { mapAntigravityAvailableModels } =
  await import("../../src/app/api/providers/[id]/models/handle-antigravity-models.ts");

test("antigravity models route keeps callable models and drops internal/excluded entries", () => {
  const models = mapAntigravityAvailableModels({
    models: {
      "gemini-3-flash-agent": {
        displayName: "Gemini 3.5 Flash (High)",
        quotaInfo: { remainingFraction: 0.5 },
      },
      "gemini-pro-agent": {
        displayName: "Gemini 3.1 Pro (High)",
        quotaInfo: { remainingFraction: 0.3 },
      },
      "gemini-3.1-pro-low": {
        displayName: "Gemini 3.1 Pro (Low)",
        quotaInfo: { remainingFraction: 0.9 },
      },
      "gpt-oss-120b-medium": {
        displayName: "GPT-OSS 120B (Medium)",
        quotaInfo: { remainingFraction: 0.2 },
      },
      "gemini-3.5-flash-low": {
        displayName: "Gemini 3.5 Flash (Medium)",
        quotaInfo: { remainingFraction: 0.8 },
      },
      "gemini-3.1-pro-high": {
        displayName: "Gemini 3.1 Pro (High)",
        quotaInfo: { remainingFraction: 0.4 },
      },
      "gemini-3-flash": {
        displayName: "Legacy Gemini 3 Flash",
        isInternal: true,
        quotaInfo: { remainingFraction: 1 },
      },
      "gemini-2.5-flash": {
        displayName: "Excluded internal model",
        quotaInfo: { remainingFraction: 1 },
      },
    },
  });

  assert.deepEqual(
    models.map((model) => model.id),
    [
      "gemini-3-flash-agent",
      "gemini-pro-agent",
      "gemini-3.1-pro-low",
      "gpt-oss-120b-medium",
      "gemini-3.5-flash-low",
    ]
  );
});
