/**
 * Regression: testing a single model could take a whole provider account out of service.
 *
 * Two independent causes, one symptom. OpenRouter answers 403 "This model requires you to
 * complete the following before use: 18+ age confirmation" for one gated model on an
 * otherwise healthy key, and that was classified as an account-level ban — isActive false,
 * testStatus banned. And the test buttons probe through the normal chat path, so the probe
 * itself persisted that ban. Every later request on the connection then failed with
 * "No credentials for provider", including probes for models that work fine.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { classifyProviderError, PROVIDER_ERROR_TYPES } =
  await import("../../open-sse/services/errorClassifier.ts");
const { isHealthCheckProbe } =
  await import("../../open-sse/handlers/chat-core/chat-core-health-check-probe.ts");
const { isTerminalConnectionStatus } = await import("../../src/domain/connection-eligibility.ts");

const MINUTE = 60 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

test("a 403 that gates one model is not an account ban", () => {
  const body = {
    error: {
      message:
        "This model requires you to complete the following before use: 18+ age confirmation. Confirm at https://openrouter.ai/settings/preferences.",
    },
  };
  assert.equal(classifyProviderError(403, body), PROVIDER_ERROR_TYPES.MODEL_FORBIDDEN);
});

test("a data-policy 403 is model-scoped too", () => {
  const body = { error: { message: "No endpoints found matching your data policy." } };
  assert.equal(classifyProviderError(403, body), PROVIDER_ERROR_TYPES.MODEL_FORBIDDEN);
});

test("a 403 whose body says nothing about the account does not ban", () => {
  // Seen on antigravity: a 403 carrying an ordinary empty completion. Banning by default
  // disabled the account over a body that made no claim about it at all.
  const body = {
    object: "chat.completion",
    model: "gemini-3-flash",
    choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
  };
  assert.equal(classifyProviderError(403, body), PROVIDER_ERROR_TYPES.MODEL_FORBIDDEN);
});

test("a 403 that names the account still bans", () => {
  for (const message of [
    "account suspended",
    "Your account has been banned",
    "Blocked for violation of our terms of service",
  ]) {
    assert.equal(
      classifyProviderError(403, { error: { message } }),
      PROVIDER_ERROR_TYPES.FORBIDDEN,
      message
    );
  }
});

test("403s already recognised as deactivation keep taking that route", () => {
  for (const message of [
    "This service has been disabled in this account for violation",
    "Verify your account to continue",
  ]) {
    assert.equal(
      classifyProviderError(403, { error: { message } }),
      PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED,
      message
    );
  }
});

test("the other 403 carve-outs are unchanged", () => {
  assert.equal(
    classifyProviderError(403, { error: { message: "This model requires a subscription" } }),
    PROVIDER_ERROR_TYPES.RATE_LIMITED
  );
  assert.equal(
    classifyProviderError(403, { error: { message: "API has not been used in project 123" } }),
    PROVIDER_ERROR_TYPES.PROJECT_ROUTE_ERROR
  );
});

test("the probe header is recognised however the request carries its headers", () => {
  assert.equal(
    isHealthCheckProbe({ headers: new Headers({ "X-Internal-Test": "combo-health-check" }) }),
    true
  );
  assert.equal(isHealthCheckProbe({ headers: { "X-Internal-Test": "combo-health-check" } }), true);
  assert.equal(isHealthCheckProbe({ headers: { "x-internal-test": "combo-health-check" } }), true);
});

/**
 * A rate limit used to be stored as `credits_exhausted`, which selection and combo scoring
 * both treat as terminal. Terminal connections are never picked, so the connection could
 * never earn the successful request that clears the status — one 429 on one model removed
 * an account from routing for good, long after its cooldown had passed.
 */
test("a credits_exhausted connection comes back once its cooldown has passed", () => {
  assert.equal(
    isTerminalConnectionStatus({
      testStatus: "credits_exhausted",
      rateLimitedUntil: iso(-MINUTE),
    }),
    false
  );
});

test("it stays out while the cooldown is still running", () => {
  assert.equal(
    isTerminalConnectionStatus({
      testStatus: "credits_exhausted",
      rateLimitedUntil: iso(MINUTE),
    }),
    true
  );
});

test("real billing exhaustion carries no cooldown and stays terminal", () => {
  assert.equal(isTerminalConnectionStatus({ testStatus: "credits_exhausted" }), true);
  assert.equal(
    isTerminalConnectionStatus({ testStatus: "credits_exhausted", rateLimitedUntil: null }),
    true
  );
  assert.equal(
    isTerminalConnectionStatus({ testStatus: "credits_exhausted", rateLimitedUntil: "nonsense" }),
    true
  );
});

test("a lapsed cooldown never revives a ban or an expired token", () => {
  assert.equal(
    isTerminalConnectionStatus({ testStatus: "banned", rateLimitedUntil: iso(-MINUTE) }),
    true
  );
  assert.equal(
    isTerminalConnectionStatus({ testStatus: "expired", rateLimitedUntil: iso(-MINUTE) }),
    true
  );
  assert.equal(isTerminalConnectionStatus({ testStatus: "unavailable" }), false);
  assert.equal(isTerminalConnectionStatus({ testStatus: "active" }), false);
});

test("ordinary traffic is never mistaken for a probe", () => {
  assert.equal(
    isHealthCheckProbe({ headers: new Headers({ Authorization: "Bearer sk-1" }) }),
    false
  );
  assert.equal(isHealthCheckProbe({ headers: { "x-internal-test": "something-else" } }), false);
  assert.equal(isHealthCheckProbe({ headers: {} }), false);
  assert.equal(isHealthCheckProbe({}), false);
  assert.equal(isHealthCheckProbe(null), false);
});
