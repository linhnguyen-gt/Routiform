import { describe, it, expect } from "vitest";
import { PROVIDER_MAX_TOKENS, getProviderMaxTokensCap } from "../config/constants.ts";

describe("ollama-cloud response truncation fix", () => {
  it("should have ollama-cloud in PROVIDER_MAX_TOKENS with 65536 limit", () => {
    expect(PROVIDER_MAX_TOKENS["ollama-cloud"]).toBe(65536);
  });

  it("should return 65536 for ollama-cloud provider via getProviderMaxTokensCap", () => {
    const cap = getProviderMaxTokensCap("ollama-cloud", "any-model");
    expect(cap).toBe(65536);
  });

  it("should match anthropic max tokens (both 65536)", () => {
    expect(PROVIDER_MAX_TOKENS["ollama-cloud"]).toBe(PROVIDER_MAX_TOKENS["anthropic"]);
  });
});
