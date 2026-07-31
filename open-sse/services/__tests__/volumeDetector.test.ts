// Runs under vitest, which owns open-sse/**/__tests__. Importing describe/it from
// node:test here made vitest report "no test suite found" and skip all 118 lines of it.
import { describe, it, vi } from "vitest";
import assert from "node:assert/strict";

// Two reasons this mock is not optional.
//
// `recommendStrategyOverride` returns early unless `adaptiveVolumeRouting` is enabled, so without
// it every "recommends X" case here asserts against a hardcoded no-op — which is precisely what
// was happening once the suite finally ran.
//
// And the real reader opens the operator's actual SQLite file. A unit test that reads (or worse,
// writes) live storage is a test whose result depends on the machine it runs on.
vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(async () => ({ adaptiveVolumeRouting: true })),
}));

import { detectVolumeSignals, recommendStrategyOverride } from "../volumeDetector";

describe("volumeDetector", async () => {
  describe("detectVolumeSignals", async () => {
    it("detects simple single-message request", async () => {
      const body = {
        messages: [{ role: "user", content: "Hello" }],
      };
      const signals = detectVolumeSignals(body);
      assert.equal(signals.batchSize, 1);
      assert.ok(signals.estimatedTokens < 100);
      assert.equal(signals.toolCount, 0);
      assert.equal(signals.hasBrowser, false);
      assert.equal(signals.complexity, "trivial");
    });

    it("detects tool-heavy request as high complexity", async () => {
      const body = {
        messages: [{ role: "user", content: "Deploy the app to production" }],
        tools: [
          { type: "function", function: { name: "run_command" } },
          { type: "function", function: { name: "read_file" } },
          { type: "function", function: { name: "write_file" } },
          { type: "function", function: { name: "browser_action" } },
        ],
      };
      const signals = detectVolumeSignals(body);
      assert.equal(signals.toolCount, 4);
      assert.equal(signals.complexity, "critical");
    });

    it("detects browser keywords", async () => {
      const body = {
        messages: [{ role: "user", content: "Navigate to the page and take a screenshot" }],
      };
      const signals = detectVolumeSignals(body);
      assert.equal(signals.hasBrowser, true);
    });

    it("detects batch from multi-part content", async () => {
      const parts = Array.from({ length: 20 }, (_, i) => ({
        type: "text",
        text: `Item ${i}`,
      }));
      const body = {
        messages: [{ role: "user", content: parts }],
      };
      const signals = detectVolumeSignals(body);
      assert.equal(signals.batchSize, 20);
    });

    it("detects security keywords as high complexity", async () => {
      const body = {
        messages: [{ role: "user", content: "Refactor the authentication module for production" }],
      };
      const signals = detectVolumeSignals(body);
      assert.ok(
        signals.complexity === "critical" || signals.complexity === "high",
        `expected critical or high, got ${signals.complexity}`
      );
    });
  });

  describe("recommendStrategyOverride", async () => {
    it("recommends round-robin for large batches", async () => {
      const signals = detectVolumeSignals({ input: Array(60).fill("item") });
      const override = await recommendStrategyOverride(signals, "priority");
      assert.equal(override.shouldOverride, true);
      assert.equal(override.strategy, "round-robin");
      assert.equal(override.preferEconomy, true);
    });

    it("recommends premium-first for browser tasks", async () => {
      const signals = {
        batchSize: 1,
        estimatedTokens: 500,
        toolCount: 2,
        hasBrowser: true,
        hasImages: false,
        complexity: "high" as const,
      };
      const override = await recommendStrategyOverride(signals, "round-robin");
      assert.equal(override.shouldOverride, true);
      assert.equal(override.strategy, "priority");
      assert.equal(override.forcePremium, true);
    });

    it("flags economy for tiny requests without changing strategy", async () => {
      const signals = {
        batchSize: 1,
        estimatedTokens: 100,
        toolCount: 0,
        hasBrowser: false,
        hasImages: false,
        complexity: "trivial" as const,
      };
      const override = await recommendStrategyOverride(signals, "priority");
      assert.equal(override.shouldOverride, false);
      assert.equal(override.preferEconomy, true);
    });

    it("no override for normal medium requests", async () => {
      const signals = {
        batchSize: 1,
        estimatedTokens: 1000,
        toolCount: 0,
        hasBrowser: false,
        hasImages: false,
        complexity: "low" as const,
      };
      const override = await recommendStrategyOverride(signals, "priority");
      assert.equal(override.shouldOverride, false);
      assert.equal(override.preferEconomy, false);
    });
  });
});
