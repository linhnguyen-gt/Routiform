import { MemoryConfigSchema, MemoryCreateInputSchema, MemoryUpdateInputSchema } from "../schemas";
import { describe, test, expect } from "vitest";

describe("Memory Schemas", () => {
  const validConfig = {
    enabled: true,
    maxTokens: 2048,
    retrievalStrategy: "semantic",
    autoSummarize: true,
    persistAcrossModels: true,
    retentionDays: 30,
    scope: "apiKey",
  };

  const validCreateInput = {
    type: "factual",
    key: "user_preference",
    content: "Dark mode enabled",
    metadata: { source: "settings" },
  };

  const validUpdateInput = {
    content: "Updated content",
    metadata: { updatedAt: new Date() },
  };

  test("MemoryConfigSchema validation", () => {
    expect(MemoryConfigSchema.parse(validConfig)).toBeDefined();
    const invalidConfig = { ...validConfig, maxTokens: -1 };
    expect(() => MemoryConfigSchema.parse(invalidConfig)).toThrow();
  });

  test("MemoryCreateInputSchema validation", () => {
    expect(MemoryCreateInputSchema.parse(validCreateInput)).toBeDefined();
    const invalidCreate = { ...validCreateInput, key: "" };
    expect(() => MemoryCreateInputSchema.parse(invalidCreate)).toThrow();
  });

  test("MemoryUpdateInputSchema validation", () => {
    expect(MemoryUpdateInputSchema.parse(validUpdateInput)).toBeDefined();

    // Every field is optional, so a partial patch is valid by design — this used to assert that
    // `{ key }` throws, which the schema never promised and never did.
    expect(MemoryUpdateInputSchema.parse({ key: "test" })).toBeDefined();
    expect(MemoryUpdateInputSchema.parse({})).toBeDefined();

    // What it actually enforces: .strict() rejects unknown keys, and the declared fields keep
    // their own constraints.
    expect(() => MemoryUpdateInputSchema.parse({ unexpected: "field" })).toThrow();
    expect(() => MemoryUpdateInputSchema.parse({ key: "" })).toThrow();
    expect(() => MemoryUpdateInputSchema.parse({ content: "" })).toThrow();
  });
});
