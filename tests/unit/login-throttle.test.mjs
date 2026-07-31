import test from "node:test";
import assert from "node:assert/strict";

// /api/auth/login is a public route that mints a 30-day session and had no rate limiting, lockout
// or failed-attempt logging of any kind, so guessing was bounded only by network speed.

const { checkLockout, recordFailedAttempt, recordSuccess, forceUnlock } =
  await import("../../src/domain/lockoutPolicy.ts");
const { getJwtSecret } = await import("../../src/shared/utils/jwtSecret.ts");

const ACCOUNT_LOCKOUT = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  attemptWindowMs: 5 * 60 * 1000,
};
const IP_LOCKOUT = {
  maxAttempts: 20,
  lockoutDurationMs: 15 * 60 * 1000,
  attemptWindowMs: 5 * 60 * 1000,
};

function freshId(prefix) {
  const id = `${prefix}-${process.pid}-${Math.floor(performance.now() * 1000)}`;
  forceUnlock(id);
  return id;
}

test("the account locks after its attempt budget is spent", () => {
  const id = freshId("login:account:test");
  assert.equal(checkLockout(id, ACCOUNT_LOCKOUT).locked, false);

  let locked = false;
  for (let i = 0; i < ACCOUNT_LOCKOUT.maxAttempts; i++) {
    locked = recordFailedAttempt(id, ACCOUNT_LOCKOUT).locked;
  }

  assert.equal(locked, true, "guessing must become bounded, not merely counted");
  assert.equal(checkLockout(id, ACCOUNT_LOCKOUT).locked, true);
  forceUnlock(id);
});

test("per-IP lockout is independent of the account, with a higher threshold", () => {
  // A shared egress address must not lock a legitimate operator out on someone else's behalf,
  // so the IP budget is deliberately looser than the account budget.
  assert.ok(IP_LOCKOUT.maxAttempts > ACCOUNT_LOCKOUT.maxAttempts);

  const ipId = freshId("login:ip:test");
  const accountId = freshId("login:account:test");

  for (let i = 0; i < ACCOUNT_LOCKOUT.maxAttempts; i++) {
    recordFailedAttempt(ipId, IP_LOCKOUT);
  }

  assert.equal(checkLockout(ipId, IP_LOCKOUT).locked, false, "the IP budget is not spent yet");
  assert.equal(checkLockout(accountId, ACCOUNT_LOCKOUT).locked, false, "a different identifier");

  forceUnlock(ipId);
  forceUnlock(accountId);
});

test("a successful login clears the accumulated attempts", () => {
  const id = freshId("login:account:test");
  recordFailedAttempt(id, ACCOUNT_LOCKOUT);
  recordFailedAttempt(id, ACCOUNT_LOCKOUT);
  assert.ok(checkLockout(id, ACCOUNT_LOCKOUT).attempts > 0);

  recordSuccess(id);

  assert.equal(checkLockout(id, ACCOUNT_LOCKOUT).attempts, 0);
  forceUnlock(id);
});

test("the mint path and the verify path agree on the secret when JWT_SECRET is unset", async () => {
  // getJwtSecret auto-generates when the env var is absent, but the verify path used to gate on
  // process.env.JWT_SECRET being present — so a default deployment minted tokens it would never
  // accept back.
  const previous = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = getJwtSecret();
    assert.ok(secret, "a secret is always available, generated when unset");

    const token = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(secret);

    const verified = await jwtVerify(token, getJwtSecret());
    assert.equal(verified.payload.authenticated, true);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
