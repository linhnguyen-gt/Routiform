import test from "node:test";
import assert from "node:assert/strict";

import { xai } from "../../src/lib/oauth/providers/xai.ts";
import { XAI_CONFIG } from "../../src/lib/oauth/constants/oauth.ts";
import { getProvider } from "../../src/lib/oauth/providers.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("xAI OAuth provider is registered", () => {
  const provider = getProvider("xai");
  assert.equal(provider.flowType, "device_code");
  assert.equal(provider.fixedPort, 56121);
  assert.equal(provider.config.clientId, XAI_CONFIG.clientId);
  assert.equal(provider.config.tokenUrl, "https://auth.x.ai/oauth2/token");
  assert.equal(provider.config.deviceCodeUrl, "https://auth.x.ai/oauth2/device/code");
});

test("xAI buildAuthUrl includes OpenCode-compatible params", () => {
  const authUrl = xai.buildAuthUrl(
    XAI_CONFIG,
    "http://127.0.0.1:56121/callback",
    "state-abc",
    "challenge-xyz"
  );
  const parsed = new URL(authUrl);

  assert.equal(parsed.origin + parsed.pathname, "https://auth.x.ai/oauth2/authorize");
  assert.equal(parsed.searchParams.get("client_id"), "b1a00492-073a-47ea-816f-4c329264a828");
  assert.equal(
    parsed.searchParams.get("scope"),
    "openid profile email offline_access grok-cli:access api:access"
  );
  assert.equal(parsed.searchParams.get("redirect_uri"), "http://127.0.0.1:56121/callback");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-xyz");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(parsed.searchParams.get("plan"), "generic");
  assert.equal(parsed.searchParams.get("referrer"), "routiform");
  assert.equal(parsed.searchParams.get("state"), "state-abc");
  assert.equal(parsed.searchParams.get("response_type"), "code");
});

test("xAI mapTokens extracts access/refresh and defaults expiresIn", () => {
  const result = xai.mapTokens({
    access_token: "access-1",
    refresh_token: "refresh-1",
    token_type: "Bearer",
    scope: "api:access",
  });

  assert.equal(result.accessToken, "access-1");
  assert.equal(result.refreshToken, "refresh-1");
  assert.equal(result.expiresIn, 3600);
  assert.equal(result.providerSpecificData?.authMethod, "oauth");
});

test("xAI mapTokens parses email from id_token JWT", () => {
  const payload = Buffer.from(JSON.stringify({ email: "user@x.ai", sub: "u1" })).toString(
    "base64url"
  );
  const idToken = `eyJhbGciOiJFUzI1NiJ9.${payload}.sig`;
  const result = xai.mapTokens({
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 7200,
    id_token: idToken,
  });

  assert.equal(result.email, "user@x.ai");
  assert.equal(result.expiresIn, 7200);
});

test("xAI requestDeviceCode posts client_id and scope", async () => {
  let captured = null;
  globalThis.fetch = async (url, init = {}) => {
    captured = {
      url: String(url),
      method: init.method,
      body: new URLSearchParams(String(init.body)),
    };
    return new Response(
      JSON.stringify({
        device_code: "DEVICE-1",
        user_code: "ABCD-1234",
        verification_uri: "https://x.ai/device",
        verification_uri_complete: "https://x.ai/device?user_code=ABCD-1234",
        expires_in: 600,
        interval: 5,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const data = await xai.requestDeviceCode(XAI_CONFIG);
  assert.equal(captured.url, XAI_CONFIG.deviceCodeUrl);
  assert.equal(captured.body.get("client_id"), XAI_CONFIG.clientId);
  assert.equal(captured.body.get("scope"), XAI_CONFIG.scope);
  assert.equal(data.device_code, "DEVICE-1");
  assert.equal(data.user_code, "ABCD-1234");
});

test("xAI pollToken returns pending and success shapes", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: "authorization_pending" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const pending = await xai.pollToken(XAI_CONFIG, "DEVICE-1");
  assert.equal(pending.ok, false);
  assert.equal(pending.data.error, "authorization_pending");

  const ok = await xai.pollToken(XAI_CONFIG, "DEVICE-1");
  assert.equal(ok.ok, true);
  assert.equal(ok.data.access_token, "AT");
  assert.equal(ok.data.refresh_token, "RT");
});

test("xAI exchangeToken posts authorization_code grant", async () => {
  let captured = null;
  globalThis.fetch = async (url, init = {}) => {
    captured = {
      url: String(url),
      body: new URLSearchParams(String(init.body)),
    };
    return new Response(
      JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 1800 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const tokens = await xai.exchangeToken(
    XAI_CONFIG,
    "code-1",
    "http://127.0.0.1:56121/callback",
    "verifier-1"
  );
  assert.equal(captured.url, XAI_CONFIG.tokenUrl);
  assert.equal(captured.body.get("grant_type"), "authorization_code");
  assert.equal(captured.body.get("client_id"), XAI_CONFIG.clientId);
  assert.equal(captured.body.get("code"), "code-1");
  assert.equal(captured.body.get("code_verifier"), "verifier-1");
  assert.equal(tokens.access_token, "AT2");
});
