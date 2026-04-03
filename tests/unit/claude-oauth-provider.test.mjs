import test from "node:test";
import assert from "node:assert/strict";

import { claude } from "../../src/lib/oauth/providers/claude.ts";
import { CLAUDE_CONFIG } from "../../src/lib/oauth/constants/oauth.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Claude OAuth provider uses the runtime redirectUri when building the auth URL", () => {
  const redirectUri = "http://localhost:43121/callback";
  const authUrl = claude.buildAuthUrl(CLAUDE_CONFIG, redirectUri, "state-123", "challenge-456");
  const parsed = new URL(authUrl);

  assert.equal(parsed.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(parsed.searchParams.get("state"), "state-123");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-456");
});

test("Claude OAuth provider uses the runtime redirectUri during token exchange", async () => {
  let captured = null;

  globalThis.fetch = async (url, init = {}) => {
    captured = {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: JSON.parse(String(init.body)),
    };

    return new Response(JSON.stringify({ access_token: "token-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const redirectUri = "http://localhost:43121/callback";
  await claude.exchangeToken(
    CLAUDE_CONFIG,
    "auth-code#state-from-fragment",
    redirectUri,
    "verifier-123",
    "state-from-request"
  );

  assert.equal(captured.url, CLAUDE_CONFIG.tokenUrl);
  assert.equal(captured.method, "POST");
  assert.equal(captured.body.redirect_uri, redirectUri);
  assert.equal(captured.body.code, "auth-code");
  assert.equal(captured.body.state, "state-from-fragment");
  assert.equal(captured.body.code_verifier, "verifier-123");
});
