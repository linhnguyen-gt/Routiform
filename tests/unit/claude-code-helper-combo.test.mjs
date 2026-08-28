import test from "node:test";
import assert from "node:assert/strict";

const {
  isNestedHelperRequest,
  helperNeedsComboFallback,
  pickActiveCombo,
  hasUsableClaudeCredentials,
} = await import("../../open-sse/services/claudeCodeHelperCombo.ts");

test("nested helper is empty tools or omitted tools", () => {
  assert.equal(isNestedHelperRequest({ tools: [] }), true);
  assert.equal(isNestedHelperRequest({}), true);
  assert.equal(isNestedHelperRequest({ tools: [{ name: "Bash" }] }), false);
});

test("REPL-shaped haiku request falls back to combo without claude OAuth", () => {
  assert.equal(
    helperNeedsComboFallback({
      combo: null,
      body: { tools: [], model: "claude-haiku-4-5", messages: [{ role: "user", content: "1+1" }] },
      provider: "claude",
      hasClaudeCredentials: false,
    }),
    true
  );
});

test("does not steal a Claude Code toolbag or an already-mapped combo", () => {
  assert.equal(
    helperNeedsComboFallback({
      combo: null,
      body: { tools: [{ name: "Bash" }, { name: "Read" }] },
      provider: "claude",
      hasClaudeCredentials: false,
    }),
    false
  );
  assert.equal(
    helperNeedsComboFallback({
      combo: { name: "main" },
      body: { tools: [] },
      provider: "claude",
      hasClaudeCredentials: false,
    }),
    false
  );
});

test("does not fallback when claude OAuth exists or provider is not claude", () => {
  assert.equal(
    helperNeedsComboFallback({
      combo: null,
      body: { tools: [] },
      provider: "claude",
      hasClaudeCredentials: true,
    }),
    false
  );
  assert.equal(
    helperNeedsComboFallback({
      combo: null,
      body: { tools: [] },
      provider: "anthropic",
      hasClaudeCredentials: false,
    }),
    false
  );
});

test("pickActiveCombo skips hidden, inactive, and empty model lists", () => {
  const picked = pickActiveCombo([
    { name: "off", isActive: false, models: ["a"] },
    { name: "hidden", isHidden: true, models: ["a"] },
    { name: "empty", models: [] },
    { name: "ok", models: ["kimi/k2"] },
  ]);
  assert.equal(picked?.name, "ok");
});

test("hasUsableClaudeCredentials rejects empty and rate-limited rows", () => {
  assert.equal(hasUsableClaudeCredentials(null), false);
  assert.equal(hasUsableClaudeCredentials({ allRateLimited: true, accessToken: "x" }), false);
  assert.equal(hasUsableClaudeCredentials({ accessToken: "" }), false);
  assert.equal(hasUsableClaudeCredentials({ accessToken: "tok" }), true);
  assert.equal(hasUsableClaudeCredentials({ apiKey: "sk" }), true);
});
