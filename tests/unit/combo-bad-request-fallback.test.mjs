import test from "node:test";
import assert from "node:assert/strict";

const { shouldFallbackComboBadRequest } = await import("../../open-sse/services/combo.ts");

test("combo bad-request fallback recognizes unsupported model responses", () => {
  assert.equal(
    shouldFallbackComboBadRequest(400, "[400]: The requested model is not supported.", "github"),
    true
  );
  assert.equal(shouldFallbackComboBadRequest(400, "Model gpt-x is not supported", "openai"), true);
});

test("combo bad-request fallback ignores unrelated 400 errors", () => {
  assert.equal(shouldFallbackComboBadRequest(400, "Invalid tool schema payload", "github"), false);
  assert.equal(
    shouldFallbackComboBadRequest(422, "The requested model is not supported.", "github"),
    false
  );
});
