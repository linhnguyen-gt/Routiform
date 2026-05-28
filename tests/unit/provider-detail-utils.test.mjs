import assert from "node:assert/strict";
import test from "node:test";

const compatUtils =
  await import("../../src/app/(dashboard)/dashboard/providers/providerDetailCompatUtils.ts");
const apiUtils =
  await import("../../src/app/(dashboard)/dashboard/providers/providerDetailApiUtils.ts");
const errorUtils =
  await import("../../src/app/(dashboard)/dashboard/providers/providerDetailErrorUtils.ts");
const cooldownUtils =
  await import("../../src/app/(dashboard)/dashboard/providers/providerDetailCooldownUtils.ts");

test("normalizeCodexLimitPolicy defaults both flags to true", () => {
  assert.deepEqual(compatUtils.normalizeCodexLimitPolicy(undefined), {
    use5h: true,
    useWeekly: true,
  });

  assert.deepEqual(compatUtils.normalizeCodexLimitPolicy({ use5h: false }), {
    use5h: false,
    useWeekly: true,
  });
});

test("normalizeAndValidateHttpBaseUrl enforces http(s) protocols", () => {
  assert.deepEqual(
    apiUtils.normalizeAndValidateHttpBaseUrl("https://example.com/v1", "https://fallback.test"),
    {
      value: "https://example.com/v1",
      error: null,
    }
  );

  assert.equal(
    apiUtils.normalizeAndValidateHttpBaseUrl("ftp://example.com", "https://fallback.test").error,
    "Base URL must use http or https"
  );

  assert.equal(
    apiUtils.normalizeAndValidateHttpBaseUrl("not-a-url", "https://fallback.test").error,
    "Base URL must be a valid URL"
  );
});

test("inferErrorType preserves explicit status and cooldown", () => {
  assert.equal(errorUtils.inferErrorType({ testStatus: "banned" }, false), "banned");
  assert.equal(errorUtils.inferErrorType({ testStatus: "active" }, true), "upstream_rate_limited");
  assert.equal(errorUtils.inferErrorType({ errorCode: 429 }, false), "upstream_rate_limited");
  assert.equal(
    errorUtils.inferErrorType({ lastError: "token expired while refreshing" }, false),
    "token_expired"
  );
});

test("getStatusPresentation maps active and disabled states", () => {
  const t = (key, fallback) => fallback || key;

  const disabled = errorUtils.getStatusPresentation({ isActive: false }, "failed", false, t);
  assert.equal(disabled.statusVariant, "default");
  assert.equal(disabled.errorType, null);

  const connected = errorUtils.getStatusPresentation({ isActive: true }, "active", false, t);
  assert.equal(connected.statusVariant, "success");
  assert.equal(connected.errorType, null);
});

test("getCooldownRemainingLabel formats remaining cooldown time", () => {
  const now = Date.parse("2026-05-28T14:32:22.000Z");

  assert.equal(cooldownUtils.getCooldownRemainingLabel("2026-05-28T14:32:44.000Z", now), "22s");
  assert.equal(cooldownUtils.getCooldownRemainingLabel("2026-05-28T14:35:44.000Z", now), "3m 22s");
  assert.equal(cooldownUtils.getCooldownRemainingLabel("2026-05-28T16:35:44.000Z", now), "2h 3m");
  assert.equal(cooldownUtils.getCooldownRemainingLabel("2026-05-28T14:32:21.000Z", now), "");
});
