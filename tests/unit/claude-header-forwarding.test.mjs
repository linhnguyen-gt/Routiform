import test from "node:test";
import assert from "node:assert/strict";

const cacheModule = await import("../../open-sse/utils/claudeHeaderCache.ts");
const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
const { getRefreshLeadMs, TOKEN_EXPIRY_BUFFER_MS } =
  await import("../../open-sse/services/tokenRefresh.ts");

const { cacheClaudeHeaders, getCachedClaudeHeaders, clearCachedClaudeHeaders } = cacheModule;

test.afterEach(() => {
  clearCachedClaudeHeaders();
});

test("cacheClaudeHeaders stores allowlisted headers from Claude Code clients", () => {
  cacheClaudeHeaders({
    "User-Agent": "claude-code/2.1.63 node/24.3.0",
    "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20",
    "Anthropic-Version": "2023-06-01",
    "X-App": "cli",
    Authorization: "Bearer should-not-cache",
    "X-Stainless-Runtime-Version": "v24.3.0",
  });

  const cached = getCachedClaudeHeaders();
  assert.equal(cached["user-agent"], "claude-code/2.1.63 node/24.3.0");
  assert.equal(cached["anthropic-beta"], "claude-code-20250219,oauth-2025-04-20");
  assert.equal(cached["x-app"], "cli");
  assert.equal(cached["x-stainless-runtime-version"], "v24.3.0");
  assert.equal(cached.authorization, undefined);
});

test("cacheClaudeHeaders ignores non-Claude clients", () => {
  cacheClaudeHeaders({
    "User-Agent": "curl/8.7.1",
    "Anthropic-Beta": "oauth-2025-04-20",
  });

  assert.equal(getCachedClaudeHeaders(), null);
});

test("DefaultExecutor overlays cached Claude headers and preserves static beta flags", () => {
  cacheClaudeHeaders({
    "user-agent": "claude-code/2.1.63 node/24.3.0",
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    "anthropic-version": "2023-06-01",
    "x-app": "cli",
    "x-stainless-runtime-version": "v24.3.0",
  });

  const executor = new DefaultExecutor("claude");
  const headers = executor.buildHeaders({ accessToken: "token-123" }, true);
  const betaFlags = headers["anthropic-beta"].split(",").map((value) => value.trim());

  assert.equal(headers.Authorization, "Bearer token-123");
  assert.equal(headers["user-agent"], "claude-code/2.1.63 node/24.3.0");
  assert.equal(headers["x-app"], "cli");
  assert.equal(headers["Anthropic-Beta"], undefined);
  assert.equal(headers["X-App"], undefined);
  assert.ok(betaFlags.includes("claude-code-20250219"));
  assert.ok(betaFlags.includes("oauth-2025-04-20"));
  assert.ok(betaFlags.includes("fine-grained-tool-streaming-2025-05-14"));
});

test("getRefreshLeadMs uses the Claude override and default fallback", () => {
  assert.equal(getRefreshLeadMs("claude"), 4 * 60 * 60 * 1000);
  assert.equal(getRefreshLeadMs("openai"), TOKEN_EXPIRY_BUFFER_MS);
  assert.equal(getRefreshLeadMs("unknown-provider"), TOKEN_EXPIRY_BUFFER_MS);
});
