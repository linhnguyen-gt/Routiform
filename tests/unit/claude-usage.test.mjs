import test from "node:test";
import assert from "node:assert/strict";

const usageService = await import("../../open-sse/services/usage.ts");

test("claude usage reads subscriptionType from OAuth usage payload", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    assert.equal(url, "https://api.anthropic.com/api/oauth/usage");
    return new Response(
      JSON.stringify({
        subscriptionType: "Pro",
        five_hour: { utilization: 34, resets_at: new Date(Date.now() + 60_000).toISOString() },
        seven_day: { utilization: 12, resets_at: new Date(Date.now() + 3600_000).toISOString() },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  try {
    const usage = await usageService.getUsageForProvider({
      provider: "claude",
      accessToken: "claude_test_token",
    });

    assert.equal(usage.plan, "Pro");
    assert.deepEqual(Object.keys(usage.quotas), ["session (5h)", "weekly (7d)"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("claude usage falls back to settings plan when OAuth usage omits plan fields", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));

    if (url === "https://api.anthropic.com/api/oauth/usage") {
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 67, resets_at: new Date(Date.now() + 60_000).toISOString() },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    if (url === "https://api.anthropic.com/v1/settings") {
      return new Response(
        JSON.stringify({
          plan: "Free",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const usage = await usageService.getUsageForProvider({
      provider: "claude",
      accessToken: "claude_test_token",
    });

    assert.equal(usage.plan, "Free");
    assert.deepEqual(calls, [
      "https://api.anthropic.com/api/oauth/usage",
      "https://api.anthropic.com/v1/settings",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
