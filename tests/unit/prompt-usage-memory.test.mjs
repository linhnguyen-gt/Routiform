import test from "node:test";
import assert from "node:assert/strict";

const {
  rememberPromptUsage,
  recallPromptUsage,
  toPromptUsageSnapshot,
  claudeUsageFromSnapshot,
  shouldRememberPromptUsage,
  buildPromptUsageSeed,
  recallPlausiblePromptUsage,
} = await import("../../open-sse/services/promptUsageMemory.ts");

test("toPromptUsageSnapshot peels cache off inclusive prompt_tokens", () => {
  const snapshot = toPromptUsageSnapshot({
    prompt_tokens: 80000,
    completion_tokens: 10,
    cache_read_input_tokens: 60000,
    cache_creation_input_tokens: 0,
  });
  assert.deepEqual(snapshot, {
    input_tokens: 20000,
    cache_read_input_tokens: 60000,
  });
});

test("remember/recall keeps the latest prompt usage for nested tool calls", () => {
  rememberPromptUsage(
    {
      prompt_tokens: 80000,
      completion_tokens: 12,
      cache_read_input_tokens: 60000,
    },
    ["sess-1"]
  );
  const recalled = recallPromptUsage(["sess-1"]);
  assert.equal(recalled.input_tokens, 20000);
  assert.equal(recalled.cache_read_input_tokens, 60000);
  const usage = claudeUsageFromSnapshot(recalled, 3);
  assert.equal(usage.input_tokens, 20000);
  assert.equal(usage.cache_read_input_tokens, 60000);
  assert.equal(usage.output_tokens, 3);
});

test("compact and other tools:[] helpers must not overwrite the main-turn snapshot", () => {
  rememberPromptUsage({ prompt_tokens: 72000, cache_read_input_tokens: 50000 }, ["sess-compact"]);
  assert.equal(shouldRememberPromptUsage({ tools: [] }), false);
  assert.equal(
    shouldRememberPromptUsage({
      tools: [{ name: "Bash" }, { name: "Read" }, { name: "WebSearch" }],
    }),
    true
  );
  const recalled = recallPromptUsage(["sess-compact"]);
  assert.equal(recalled.input_tokens, 22000);
  assert.equal(recalled.cache_read_input_tokens, 50000);
});

test("main-turn seed prefers last real usage so the meter does not bounce estimate to provider", () => {
  rememberPromptUsage({ input_tokens: 290051, cache_read_input_tokens: 27648, output_tokens: 82 }, [
    "ds-bounce",
  ]);
  const { seed, compact } = buildPromptUsageSeed({
    body: {
      tools: [{ name: "Bash" }],
      messages: [
        { role: "user", content: "start" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "tool result" },
        { role: "assistant", content: "more" },
        { role: "user", content: "next" },
      ],
    },
    keys: ["ds-bounce"],
    estimatedTokens: 221000,
    estimatedFloorTokens: 40000,
  });
  assert.equal(compact, false);
  assert.equal(seed.input_tokens, 290051);
  assert.equal(seed.cache_read_input_tokens, 27648);
});

test("new conversation does not replay the previous session snapshot on message_start", () => {
  rememberPromptUsage(
    { input_tokens: 185111, cache_read_input_tokens: 28416, output_tokens: 177 },
    ["account-uuid", "old-session", "local"]
  );
  const { seed, compact } = buildPromptUsageSeed({
    body: {
      tools: [{ name: "Bash" }, { name: "Read" }],
      messages: [
        { role: "user", content: "<system-reminder>\n# claudeMd\n" },
        { role: "user", content: "hello" },
      ],
    },
    keys: ["account-uuid", "new-session", "local"],
    estimatedTokens: 94000,
    estimatedFloorTokens: 40000,
  });
  assert.equal(compact, false);
  assert.equal(seed.input_tokens, 94000);
  assert.equal(seed.cache_read_input_tokens, undefined);
});

test("seed uses current estimate when it is larger than a stale compact floor", () => {
  rememberPromptUsage({ input_tokens: 56622 }, ["glm-stuck"]);
  const { seed, compact } = buildPromptUsageSeed({
    body: {
      tools: [{ name: "Bash" }, { name: "Read" }],
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
        { role: "assistant", content: "d" },
        { role: "user", content: "keep going" },
      ],
    },
    keys: ["glm-stuck"],
    estimatedTokens: 145345,
    estimatedFloorTokens: 56622,
  });
  assert.equal(compact, false);
  assert.equal(seed.input_tokens, 145345);
});

test("stale snapshot much larger than the current estimate is not used as seed", () => {
  rememberPromptUsage({ input_tokens: 185111, cache_read_input_tokens: 28416 }, ["ds-stale"]);
  const { seed } = buildPromptUsageSeed({
    body: {
      tools: [{ name: "Bash" }],
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
        { role: "assistant", content: "d" },
        { role: "user", content: "e" },
      ],
    },
    keys: ["ds-stale"],
    estimatedTokens: 94000,
    estimatedFloorTokens: 40000,
  });
  assert.equal(seed.input_tokens, 94000);
  assert.equal(seed.cache_read_input_tokens, undefined);
});

test("compact seed uses the floor even when a huge main-turn snapshot exists", () => {
  rememberPromptUsage({ input_tokens: 290051, cache_read_input_tokens: 27648 }, [
    "ds-compact-seed",
  ]);
  const { seed, compact } = buildPromptUsageSeed({
    body: {
      tools: [{ name: "Bash" }],
      messages: [
        {
          role: "user",
          content:
            "Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests.",
        },
      ],
    },
    keys: ["ds-compact-seed"],
    estimatedTokens: 300000,
    estimatedFloorTokens: 42951,
  });
  assert.equal(compact, true);
  assert.equal(seed.input_tokens, 42951);
  assert.equal(seed.cache_read_input_tokens, undefined);
});

test("recall falls back to local when session key misses", () => {
  rememberPromptUsage({ prompt_tokens: 40000, cache_read_input_tokens: 30000 }, ["other"]);
  const recalled = recallPromptUsage(["missing-session"]);
  assert.ok(recalled);
  assert.equal(recalled.input_tokens, 10000);
  assert.equal(recalled.cache_read_input_tokens, 30000);
});

test("gated recall rejects a fresh conversation even though the raw recall replays it", () => {
  rememberPromptUsage({ input_tokens: 185111, cache_read_input_tokens: 28416 }, [
    "gate-account",
    "gate-old-session",
    "local",
  ]);
  // raw recall has no conversation guard and falls through to the account key
  assert.ok(recallPromptUsage(["gate-fresh-session"]));
  const gated = recallPlausiblePromptUsage({
    body: {
      tools: [{ name: "WebSearch" }],
      messages: [{ role: "user", content: "hello" }],
    },
    keys: ["gate-fresh-session", "gate-account"],
    estimatedTokens: 94000,
  });
  assert.equal(gated, null);
});

test("gated recall applies the ratio band to stale snapshots", () => {
  rememberPromptUsage({ prompt_tokens: 15000, cache_read_input_tokens: 5000 }, ["gate-src"]);
  // recalled total 15000 is far below the current estimate
  const gated = recallPlausiblePromptUsage({
    body: {
      tools: [{ name: "WebSearch" }],
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
        { role: "assistant", content: "d" },
        { role: "user", content: "e" },
      ],
    },
    keys: ["gate-src"],
    estimatedTokens: 90000,
  });
  assert.equal(gated, null);
});

test("gated recall accepts a plausible same-conversation snapshot", () => {
  rememberPromptUsage({ input_tokens: 20000, cache_read_input_tokens: 0 }, ["gate-ok"]);
  const gated = recallPlausiblePromptUsage({
    body: {
      tools: [{ name: "WebSearch" }],
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
        { role: "assistant", content: "d" },
        { role: "user", content: "e" },
      ],
    },
    keys: ["gate-ok"],
    estimatedTokens: 22000,
  });
  assert.ok(gated);
  assert.equal(gated.input_tokens, 20000);
});
