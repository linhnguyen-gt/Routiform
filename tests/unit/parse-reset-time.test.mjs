import test from "node:test";
import assert from "node:assert/strict";

import { parseResetTime } from "../../open-sse/services/usage.ts";

test("parseResetTime: unix seconds → future ISO (Kiro freeTrialExpiry)", () => {
  // ~2026 in seconds
  const sec = 1893456000;
  const iso = parseResetTime(sec);
  assert.ok(iso);
  const d = new Date(iso);
  assert.ok(d.getFullYear() >= 2025);
});

test("parseResetTime: unix ms unchanged (13 digits)", () => {
  const ms = 1735689600000;
  const iso = parseResetTime(ms);
  assert.equal(iso, new Date(ms).toISOString());
});

test("parseResetTime: numeric string seconds", () => {
  const sec = 1893456000;
  const iso = parseResetTime(String(sec));
  assert.equal(iso, parseResetTime(sec));
});
