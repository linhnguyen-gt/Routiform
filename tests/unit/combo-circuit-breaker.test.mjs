import test from "node:test";
import assert from "node:assert/strict";

// Reset circuit breaker registry between tests
const {
  CircuitBreaker: _CircuitBreaker,
  getCircuitBreaker,
  getAllCircuitBreakerStatuses: _getAllCircuitBreakerStatuses,
  STATE,
} = await import("../../src/shared/utils/circuitBreaker.ts");

const { handleComboChat, getComboFromData: _getComboFromData } =
  await import("../../open-sse/services/combo.ts");

const { PROVIDER_PROFILES } = await import("../../open-sse/config/constants.ts");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a mock logger */
function mockLog() {
  const entries = [];
  return {
    info: (tag, msg) => entries.push({ level: "info", tag, msg }),
    warn: (tag, msg) => entries.push({ level: "warn", tag, msg }),
    error: (tag, msg) => entries.push({ level: "error", tag, msg }),
    entries,
  };
}

/** Create a handleSingleModel that returns given status codes in sequence */
function mockHandler(statusSequence) {
  let callIndex = 0;
  return async (_body, _modelStr) => {
    const status = statusSequence[callIndex] ?? statusSequence[statusSequence.length - 1] ?? 200;
    callIndex++;
    if (status === 200) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: `Error ${status}` } }), {
      status,
      statusText: `Error ${status}`,
    });
  };
}

// ─── Circuit Breaker Integration Tests ──────────────────────────────────────
// NOTE: combo.ts uses the full model string (e.g. "combo:groq/llama-3.3-70b")
// as the circuit breaker key, not just the provider prefix.

test("handleComboChat: circuit breaker opens after repeated 502 errors", async () => {
  // breaker key mirrors what combo.ts uses: "combo:<full-model-string>"
  const breakerKey = "combo:groq/llama-3.3-70b";
  const breaker = getCircuitBreaker(breakerKey, {
    failureThreshold: 3,
    resetTimeout: 60000,
  });
  breaker.reset();

  const combo = {
    name: "test-combo",
    models: [{ model: "groq/llama-3.3-70b", weight: 0 }],
    strategy: "priority",
    config: { maxRetries: 0 },
  };

  const log = mockLog();

  // Send 3 requests that all fail with 502 → breaker should open
  for (let i = 0; i < 3; i++) {
    await handleComboChat({
      body: {},
      combo,
      handleSingleModel: mockHandler([502]),
      isModelAvailable: () => true,
      log,
      settings: null,
      allCombos: null,
    });
  }

  // Breaker should now be OPEN
  const status = breaker.getStatus();
  console.log("=== BREAKER STATUS AFTER 3 CALLS ===", status);
  assert.equal(status.state, STATE.OPEN, "Breaker should be OPEN after 3 failures");
  assert.equal(status.failureCount, 3, "Failure count should be 3");
});

test("handleComboChat: skips models with open circuit breaker", async () => {
  // Set up: groq breaker is OPEN, fireworks breaker is CLOSED
  const groqBreakerKey = "combo:groq/llama-3.3-70b";
  const groqBreaker = getCircuitBreaker(groqBreakerKey, {
    failureThreshold: 3,
    resetTimeout: 60000,
  });
  groqBreaker.reset();
  // Force open the breaker
  groqBreaker._onFailure();
  groqBreaker._onFailure();
  groqBreaker._onFailure();
  assert.equal(groqBreaker.getStatus().state, STATE.OPEN);

  const fireworksBreakerKey = "combo:fireworks/deepseek-v3p1";
  const fireworksBreaker = getCircuitBreaker(fireworksBreakerKey, {
    failureThreshold: 5,
    resetTimeout: 30000,
  });
  fireworksBreaker.reset();

  const combo = {
    name: "test-skip-combo",
    models: [
      { model: "groq/llama-3.3-70b", weight: 0 },
      { model: "fireworks/deepseek-v3p1", weight: 0 },
    ],
    strategy: "priority",
  };

  const log = mockLog();

  const result = await handleComboChat({
    body: {},
    combo,
    handleSingleModel: mockHandler([200]), // fireworks will succeed
    isModelAvailable: () => true,
    log,
    settings: null,
    allCombos: null,
  });

  assert.equal(result.ok, true, "Should succeed via fireworks fallback");

  // Check logs show groq was skipped
  const skipLog = log.entries.find(
    (e) => e.msg.includes("circuit breaker OPEN") && e.msg.includes("groq")
  );
  assert.ok(skipLog, "Should log that groq was skipped due to breaker");
});

test("handleComboChat: returns 503 when all breakers are open", async () => {
  // Open both breakers using the full model string keys
  const groqBreaker = getCircuitBreaker("combo:groq/llama-3.3-70b");
  groqBreaker.reset();
  groqBreaker._onFailure();
  groqBreaker._onFailure();
  groqBreaker._onFailure();

  const fireworksBreaker = getCircuitBreaker("combo:fireworks/deepseek-v3p1");
  fireworksBreaker.reset();
  for (let i = 0; i < 5; i++) fireworksBreaker._onFailure();

  const combo = {
    name: "test-all-open",
    models: [
      { model: "groq/llama-3.3-70b", weight: 0 },
      { model: "fireworks/deepseek-v3p1", weight: 0 },
    ],
    strategy: "priority",
  };

  const log = mockLog();

  const result = await handleComboChat({
    body: {},
    combo,
    handleSingleModel: mockHandler([200]), // Won't be called
    isModelAvailable: () => true,
    log,
    settings: null,
    allCombos: null,
  });

  assert.equal(result.status, 503, "Should return 503");
  const body = await result.json();
  assert.ok(body.error.message.includes("circuit breakers open"), "Should mention breakers");
});

test("handleComboChat: 429 errors also trigger circuit breaker", async () => {
  const breakerKey = "combo:cerebras/llama-3.3-70b";
  const breaker = getCircuitBreaker(breakerKey, {
    failureThreshold: 5,
    resetTimeout: 30000,
  });
  breaker.reset();

  const combo = {
    name: "test-429",
    models: [{ model: "cerebras/llama-3.3-70b", weight: 0 }],
    strategy: "priority",
  };

  const log = mockLog();

  // 5 x 429 should open breaker
  for (let i = 0; i < 5; i++) {
    await handleComboChat({
      body: {},
      combo,
      handleSingleModel: mockHandler([429]),
      isModelAvailable: () => true,
      log,
      settings: null,
      allCombos: null,
    });
  }

  assert.equal(breaker.getStatus().state, STATE.OPEN, "429s should open breaker");
});

test("circuit breaker uses provider profile thresholds", () => {
  // OAuth providers (e.g. claude) should have lower threshold
  assert.equal(PROVIDER_PROFILES.oauth.circuitBreakerThreshold, 3);
  // API providers (e.g. groq) should have higher threshold
  assert.equal(PROVIDER_PROFILES.apikey.circuitBreakerThreshold, 5);
});
