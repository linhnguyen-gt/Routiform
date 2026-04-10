import { describe, it, expect } from "vitest";
import { adjustMaxTokens } from "../maxTokensHelper.ts";

describe("adjustMaxTokens - negative values", () => {
  it("clamps large negative max_tokens to 1", () => {
    const result = adjustMaxTokens({ max_tokens: -36398 });
    expect(result).toBe(1);
  });

  it("clamps -1 max_tokens to 1", () => {
    const result = adjustMaxTokens({ max_tokens: -1 });
    expect(result).toBe(1);
  });

  it("does not clamp positive values", () => {
    const result = adjustMaxTokens({ max_tokens: 4096 });
    expect(result).toBe(4096);
  });

  it("prefers max_completion_tokens when present", () => {
    const result = adjustMaxTokens({ max_tokens: 4096, max_completion_tokens: 2048 });
    expect(result).toBe(2048);
  });

  it("clamps negative max_completion_tokens to 1", () => {
    const result = adjustMaxTokens({ max_completion_tokens: -1 });
    expect(result).toBe(1);
  });

  it("uses DEFAULT_MAX_TOKENS when max_tokens is 0 or undefined", () => {
    const result = adjustMaxTokens({});
    expect(result).toBeGreaterThan(0);
  });
});
