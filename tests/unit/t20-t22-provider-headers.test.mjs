import test from "node:test";
import assert from "node:assert/strict";

const { REGISTRY } = await import("../../open-sse/config/providerRegistry.ts");

test("T20: antigravity config has updated User-Agent and sandbox fallback URL", () => {
  const antigravity = REGISTRY.antigravity;
  assert.ok(Array.isArray(antigravity.baseUrls));
  assert.ok(
    antigravity.baseUrls.some((u) => u === "https://daily-cloudcode-pa.sandbox.googleapis.com")
  );
  // The CLI's own User-Agent, captured from the real client. cloudcode-pa gates
  // the model catalogue on it: the previous "antigravity/1.107.0 darwin/arm64"
  // (the IDE's VSCode-OSS version) returned 24 models with no Gemini 3.7 Flash,
  // this one returns 27 including it, for the same token.
  assert.equal(
    antigravity.headers["User-Agent"],
    "antigravity/cli/1.1.13 (aidev_client; os_type=darwin; arch=arm64; cl=964361259; auth_method=consumer)"
  );
});

test("T22: github headers include updated editor/plugin versions and required fields", () => {
  const github = REGISTRY.github;
  assert.equal(github.headers["editor-version"], "vscode/1.110.0");
  assert.equal(github.headers["editor-plugin-version"], "copilot-chat/0.38.0");
  assert.equal(github.headers["user-agent"], "GitHubCopilotChat/0.38.0");
  assert.equal(github.headers["x-github-api-version"], "2025-04-01");
  assert.equal(github.headers["x-vscode-user-agent-library-version"], "electron-fetch");
  assert.equal(github.headers["X-Initiator"], "user");
});

test("T22: github config exposes dedicated responses endpoint", () => {
  const github = REGISTRY.github;
  assert.equal(github.responsesBaseUrl, "https://api.githubcopilot.com/responses");
  assert.equal(github.baseUrl, "https://api.githubcopilot.com/chat/completions");
});
