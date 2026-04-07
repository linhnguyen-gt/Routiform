import test from "node:test";
import assert from "node:assert/strict";

test("getGlobalFallbackStatusCodes defaults to 502,503", async () => {
  const { getGlobalFallbackStatusCodes } = await import("../../src/lib/globalComboFallback.ts");
  assert.deepEqual(getGlobalFallbackStatusCodes({}), [502, 503]);
  assert.deepEqual(getGlobalFallbackStatusCodes(undefined), [502, 503]);
});

test("getGlobalFallbackStatusCodes respects settings array", async () => {
  const { getGlobalFallbackStatusCodes } = await import("../../src/lib/globalComboFallback.ts");
  assert.deepEqual(
    getGlobalFallbackStatusCodes({ globalFallbackStatusCodes: [503, 429, 502] }),
    [429, 502, 503]
  );
});
