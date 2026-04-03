import test from "node:test";
import assert from "node:assert/strict";

import { OAUTH_ENDPOINTS } from "../../open-sse/config/constants.ts";
import { qoder } from "../../src/lib/oauth/providers/qoder.ts";
import { QODER_CONFIG } from "../../src/lib/oauth/constants/oauth.ts";

test("Qoder OAuth defaults no longer point to qoder.cn", () => {
  assert.doesNotMatch(QODER_CONFIG.authorizeUrl || "", /qoder\.cn/i);
  assert.doesNotMatch(QODER_CONFIG.tokenUrl || "", /qoder\.cn/i);
  assert.doesNotMatch(QODER_CONFIG.userInfoUrl || "", /qoder\.cn/i);
  assert.doesNotMatch(OAUTH_ENDPOINTS.qoder.auth || "", /qoder\.cn/i);
  assert.doesNotMatch(OAUTH_ENDPOINTS.qoder.token || "", /qoder\.cn/i);
});

test("Qoder OAuth provider returns null when browser auth is not configured", () => {
  if (!QODER_CONFIG.enabled) {
    assert.equal(qoder.buildAuthUrl(QODER_CONFIG, "http://localhost:8080/callback", "state"), null);
    return;
  }

  const authUrl = qoder.buildAuthUrl(QODER_CONFIG, "http://localhost:8080/callback", "state");
  assert.equal(typeof authUrl, "string");
  assert.doesNotMatch(authUrl || "", /qoder\.cn/i);
});
