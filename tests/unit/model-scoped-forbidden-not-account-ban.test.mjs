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

test("a plain 403 still bans, and the other 403 carve-outs are unchanged", () => {
  assert.equal(
    classifyProviderError(403, { error: { message: "account suspended" } }),
    PROVIDER_ERROR_TYPES.FORBIDDEN
  );
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
