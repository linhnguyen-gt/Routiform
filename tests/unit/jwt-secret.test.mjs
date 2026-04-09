import test from "node:test";
import assert from "node:assert/strict";

const { getJwtSecret } = await import("../../src/shared/utils/jwtSecret.ts");

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) {
    delete process.env.JWT_SECRET;
    return;
  }

  process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

test("getJwtSecret reads the latest process.env value on each call", () => {
  process.env.JWT_SECRET = "first-secret";
  assert.equal(Buffer.from(getJwtSecret()).toString("utf8"), "first-secret");

  process.env.JWT_SECRET = "second-secret";
  assert.equal(Buffer.from(getJwtSecret()).toString("utf8"), "second-secret");
});

test("getJwtSecret returns null when JWT_SECRET is blank", () => {
  process.env.JWT_SECRET = "   ";
  assert.equal(getJwtSecret(), null);
});
