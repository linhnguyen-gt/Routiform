import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Context Validation & Compression", () => {
  describe("estimateRequestTokens", () => {
    it("should estimate tokens from messages", async () => {
      const { estimateRequestTokens } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [
          { role: "user", content: "Hello world" },
          { role: "assistant", content: "Hi there!" },
        ],
      };

      const tokens = estimateRequestTokens(body);
      assert.ok(tokens > 0, "Should estimate non-zero tokens");
      assert.ok(tokens < 100, "Should be reasonable estimate for short messages");
    });

    it("should include system message in estimation", async () => {
      const { estimateRequestTokens } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Hello" }],
      };

      const tokens = estimateRequestTokens(body);
      assert.ok(tokens > 0, "Should include system message tokens");
    });

    it("should include tools in estimation", async () => {
      const { estimateRequestTokens } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather for a location",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      };

      const tokens = estimateRequestTokens(body);
      assert.ok(tokens > 10, "Should include tool definition tokens");
    });
  });

  describe("validateContextLimit", () => {
    it("should validate request within limit", async () => {
      const { validateContextLimit } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [{ role: "user", content: "Short message" }],
      };

      const result = validateContextLimit(body, "openai", "gpt-4", null);
      assert.ok(result.valid, "Should be valid for short message");
      assert.strictEqual(result.exceeded, 0, "Should have no exceeded tokens");
    });

    it("should detect oversized request", async () => {
      const { validateContextLimit } = await import("../../open-sse/services/contextManager.ts");

      // Create a very long message
      const longContent = "x".repeat(1000000); // ~250k tokens
      const body = {
        messages: [{ role: "user", content: longContent }],
      };

      const result = validateContextLimit(body, "openai", "gpt-4", null);
      assert.ok(!result.valid, "Should be invalid for oversized message");
      assert.ok(result.exceeded > 0, "Should have exceeded tokens");
    });

    it("should respect combo context_length", async () => {
      const { validateContextLimit } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [{ role: "user", content: "x".repeat(100000) }], // ~25k tokens
      };

      const combo = { context_length: 10000 };
      const result = validateContextLimit(body, "openai", "gpt-4", combo);
      assert.ok(!result.valid, "Should respect combo limit");
      assert.ok(result.exceeded > 0, "Should exceed combo limit");
    });
  });

  describe("getEffectiveContextLimit", () => {
    it("should use combo context_length when provided", async () => {
      const { getEffectiveContextLimit } =
        await import("../../open-sse/services/contextManager.ts");

      const combo = { context_length: 50000 };
      const limit = getEffectiveContextLimit("openai", "gpt-4", combo);
      assert.strictEqual(limit, 50000, "Should use combo context_length");
    });

    it("should fall back to model limit when no combo", async () => {
      const { getEffectiveContextLimit } =
        await import("../../open-sse/services/contextManager.ts");

      const limit = getEffectiveContextLimit("openai", "gpt-4", null);
      assert.ok(limit > 0, "Should return model limit");
      assert.ok(limit >= 128000, "GPT-4 should have at least 128k context");
    });

    it("should prioritize env override over combo", async () => {
      const { getEffectiveContextLimit } =
        await import("../../open-sse/services/contextManager.ts");

      process.env.CONTEXT_LENGTH_OPENAI = "100000";
      const combo = { context_length: 50000 };
      const limit = getEffectiveContextLimit("openai", "gpt-4", combo);
      assert.strictEqual(limit, 100000, "Should use env override");
      delete process.env.CONTEXT_LENGTH_OPENAI;
    });
  });

  describe("compressContext", () => {
    it("should not compress when within limit", async () => {
      const { compressContext } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [{ role: "user", content: "Short message" }],
      };

      const result = compressContext(body, { provider: "openai", maxTokens: 128000 });
      assert.strictEqual(result.compressed, false, "Should not compress");
    });

    it("should trim tool messages when oversized", async () => {
      const { compressContext } = await import("../../open-sse/services/contextManager.ts");

      const longToolResult = "x".repeat(10000);
      const body = {
        messages: [
          { role: "user", content: "Run tool" },
          { role: "tool", content: longToolResult },
        ],
      };

      const result = compressContext(body, { provider: "openai", maxTokens: 1000 });
      assert.ok(result.compressed, "Should compress");
      assert.ok(
        result.body.messages[1].content.length < longToolResult.length,
        "Should trim tool message"
      );
    });

    it("should compress thinking blocks", async () => {
      const { compressContext } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: [
          { role: "user", content: "Question" },
          {
            role: "assistant",
            content: [
              { type: "thinking", text: "Long thinking process..." },
              { type: "text", text: "Answer" },
            ],
          },
          { role: "user", content: "Follow-up" },
          {
            role: "assistant",
            content: [
              { type: "thinking", text: "More thinking..." },
              { type: "text", text: "Final answer" },
            ],
          },
        ],
      };

      const result = compressContext(body, { provider: "openai", maxTokens: 500 });
      assert.ok(result.compressed, "Should compress");
      // Last assistant message should keep thinking, earlier ones should not
      const lastMsg = result.body.messages[result.body.messages.length - 1];
      assert.ok(
        Array.isArray(lastMsg.content) && lastMsg.content.some((b) => b.type === "thinking"),
        "Should keep thinking in last message"
      );
    });

    it("should purify history when still oversized", async () => {
      const { compressContext } = await import("../../open-sse/services/contextManager.ts");

      const body = {
        messages: Array.from({ length: 100 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: "x".repeat(1000),
        })),
      };

      const result = compressContext(body, { provider: "openai", maxTokens: 5000 });
      assert.ok(result.compressed, "Should compress");
      assert.ok(result.body.messages.length < body.messages.length, "Should drop old messages");
    });
  });
});
