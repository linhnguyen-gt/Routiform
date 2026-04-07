import test from "node:test";
import assert from "node:assert/strict";

test("getProviderMaxTokensCap: github Haiku → 8192", async () => {
  const { getProviderMaxTokensCap } = await import("../../open-sse/config/constants.ts");
  assert.equal(getProviderMaxTokensCap("github", "claude-haiku-4.5"), 8192);
  assert.equal(getProviderMaxTokensCap("github", "gh/claude-haiku-4.5"), 8192);
  assert.equal(getProviderMaxTokensCap("github", "anthropic/claude-3-haiku"), 8192);
});

test("getProviderMaxTokensCap: github non-Haiku uses provider table", async () => {
  const { getProviderMaxTokensCap } = await import("../../open-sse/config/constants.ts");
  assert.equal(getProviderMaxTokensCap("github", "claude-sonnet-4.5"), 32000);
});

test("getProviderMaxTokensCap: unknown provider → null", async () => {
  const { getProviderMaxTokensCap } = await import("../../open-sse/config/constants.ts");
  assert.equal(getProviderMaxTokensCap("cursor", "gpt-4"), null);
});
