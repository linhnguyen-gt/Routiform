import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-chat-combo-live-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const chatRoute = await import("../../src/app/api/v1/chat/completions/route.ts");
const quotaCache = await import("../../src/domain/quotaCache.ts");
const { generateSignature, invalidateBySignature, setCachedResponse } =
  await import("../../src/lib/semanticCache.ts");
const { clearModelUnavailability, resetAllAvailability, setModelUnavailable } =
  await import("../../src/domain/modelAvailability.ts");
const { getCircuitBreaker, resetAllCircuitBreakers, STATE } =
  await import("../../src/shared/utils/circuitBreaker.ts");

const originalFetch = globalThis.fetch;

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  resetAllAvailability();
  resetAllCircuitBreakers();
}

async function seedSuppressedConnection() {
  return providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "openai-live-test",
    apiKey: "sk-live-test",
    isActive: true,
    testStatus: "credits_exhausted",
    rateLimitedUntil: new Date(Date.now() + 60_000).toISOString(),
  });
}

async function seedHealthyConnection() {
  return providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "openai-cache-test",
    apiKey: "sk-cache-test",
    isActive: true,
    testStatus: "active",
  });
}

async function seedQuotaLimitedConnection() {
  const connection = await providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "openai-quota-limited-test",
    apiKey: "sk-quota-limited-test",
    isActive: true,
    testStatus: "active",
    providerSpecificData: {
      limitPolicy: {
        enabled: true,
        thresholdPercent: 90,
        windows: ["daily"],
      },
    },
  });

  quotaCache.setQuotaCache(connection.id, "openai", {
    daily: {
      used: 100,
      total: 100,
      remainingPercentage: 0,
      resetAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  return connection;
}

function makeRequest(extraHeaders = {}) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with OK only." }],
      max_tokens: 16,
      stream: false,
    }),
  });
}

test.beforeEach(async () => {
  globalThis.fetch = originalFetch;
  await resetStorage();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetAllAvailability();
  resetAllCircuitBreakers();
});

test.after(() => {
  globalThis.fetch = originalFetch;
  resetAllAvailability();
  resetAllCircuitBreakers();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("combo live test bypasses model cooldown and breaker but skips suppressed accounts", async () => {
  const suppressed = await seedSuppressedConnection();
  const healthy = await seedHealthyConnection();

  setModelUnavailable("openai", "gpt-4o-mini", 60_000, "test cooldown");
  const breaker = getCircuitBreaker("openai");
  breaker.state = STATE.OPEN;
  breaker.lastFailureTime = Date.now();

  const fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return Response.json({
      id: "chatcmpl-live-test",
      choices: [
        {
          message: {
            role: "assistant",
            content: "OK",
          },
        },
      ],
    });
  };

  const blockedByCooldown = await chatRoute.POST(makeRequest());
  assert.equal(blockedByCooldown.status, 503);
  assert.equal(fetchCalls.length, 0);

  clearModelUnavailability("openai", "gpt-4o-mini");

  const blockedByBreaker = await chatRoute.POST(makeRequest());
  assert.equal(blockedByBreaker.status, 503);
  assert.equal(fetchCalls.length, 0);

  const liveResponse = await chatRoute.POST(
    makeRequest({
      "X-Internal-Test": "combo-health-check",
      "X-Routiform-No-Cache": "true",
      "X-Request-Id": "combo-test-suppressed-skip",
    })
  );
  const liveBody = await liveResponse.json();

  assert.equal(liveResponse.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /\/chat\/completions$/);
  assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer sk-cache-test");
  assert.equal(liveBody.choices[0].message.content, "OK");

  const suppressedAfter = await providersDb.getProviderConnectionById(suppressed.id);
  assert.equal(suppressedAfter.testStatus, "credits_exhausted");

  const healthyAfter = await providersDb.getProviderConnectionById(healthy.id);
  assert.equal(healthyAfter.testStatus, "active");
});

test("combo live test respects account quota policy and uses an eligible fallback", async () => {
  await seedQuotaLimitedConnection();
  const healthy = await seedHealthyConnection();

  const fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return Response.json({
      id: "chatcmpl-quota-policy-test",
      choices: [
        {
          message: {
            role: "assistant",
            content: "OK",
          },
        },
      ],
    });
  };

  const liveResponse = await chatRoute.POST(
    makeRequest({
      "X-Internal-Test": "combo-health-check",
      "X-Routiform-No-Cache": "true",
      "X-Request-Id": "combo-test-quota-policy",
    })
  );
  const liveBody = await liveResponse.json();

  assert.equal(liveResponse.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer sk-cache-test");
  assert.equal(liveBody.choices[0].message.content, "OK");

  const healthyAfter = await providersDb.getProviderConnectionById(healthy.id);
  assert.equal(healthyAfter.testStatus, "active");
});

test("combo live test bypasses semantic cache and forces a fresh upstream request", async () => {
  await seedHealthyConnection();

  const signature = generateSignature(
    "gpt-4o-mini",
    [{ role: "user", content: "Reply with OK only." }],
    0,
    1
  );

  setCachedResponse(signature, "gpt-4o-mini", {
    id: "chatcmpl-cached",
    choices: [
      {
        message: {
          role: "assistant",
          content: "CACHED",
        },
      },
    ],
  });

  const fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return Response.json({
      id: "chatcmpl-live",
      choices: [
        {
          message: {
            role: "assistant",
            content: "LIVE",
          },
        },
      ],
    });
  };

  try {
    const cachedResponse = await chatRoute.POST(makeRequest());
    const cachedBody = await cachedResponse.json();

    assert.equal(cachedResponse.status, 200);
    assert.equal(fetchCalls.length, 0);
    assert.equal(cachedBody.choices[0].message.content, "CACHED");

    const liveResponse = await chatRoute.POST(
      makeRequest({
        "X-Internal-Test": "combo-health-check",
        "X-Routiform-No-Cache": "true",
        "X-Request-Id": "combo-test-cache-bypass",
      })
    );
    const liveBody = await liveResponse.json();

    assert.equal(liveResponse.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/chat\/completions$/);
    assert.equal(liveBody.choices[0].message.content, "LIVE");
  } finally {
    invalidateBySignature(signature);
  }
});
