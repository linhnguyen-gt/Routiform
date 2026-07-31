import test from "node:test";
import assert from "node:assert/strict";

/**
 * Whether `/api/*` and `/dashboard/*` agree about when authentication is required.
 *
 * They did not. `proxy.ts` opens the dashboard only for a FRESH install — `!setupComplete &&
 * !password` — and once setup is complete admits nothing but `/dashboard/settings`, which is the
 * #151 hardening: a password row that is set and then lost must not reopen the whole app.
 * `isAuthRequired()`, which every `/api/*` route consults, dropped the `!setupComplete` term and
 * returned "no auth needed" for the entire management API on the same install.
 *
 * The plan explicitly refused to settle this by reading the source, because both branches look
 * defensible on paper and the real question is behavioural: does onboarding still work once the
 * stricter policy applies? It does, and the reason is in `proxy.ts:91-97` — `/api/settings` has
 * its own explicit carve-out for exactly the no-password case, so the broad exemption was never
 * what made onboarding work.
 */

const { isAuthRequired } = await import("../../src/shared/utils/apiAuth.ts");
const localDb = await import("../../src/lib/localDb.ts");

const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;

async function withSettings(patch, fn) {
  delete process.env.INITIAL_PASSWORD;
  await localDb.updateSettings({
    requireLogin: true,
    setupComplete: false,
    password: "",
    ...patch,
  });
  try {
    return await fn();
  } finally {
    if (ORIGINAL_INITIAL_PASSWORD === undefined) delete process.env.INITIAL_PASSWORD;
    else process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
}

test("a fresh install needs no auth, so onboarding can start", async () => {
  await withSettings({ setupComplete: false, password: "" }, async () => {
    assert.equal(await isAuthRequired(), false, "first run must be reachable");
  });
});

test("an install with a password needs auth", async () => {
  await withSettings({ setupComplete: true, password: "hashed" }, async () => {
    assert.equal(await isAuthRequired(), true);
  });
});

test("requireLogin: false disables auth regardless of setup state", async () => {
  await withSettings({ requireLogin: false, setupComplete: true, password: "hashed" }, async () => {
    assert.equal(await isAuthRequired(), false, "an explicit operator choice is honoured");
  });
});

test("setup complete with no password STILL requires auth", async () => {
  // The #151 case. A password that was set and then lost leaves exactly this state, and the old
  // behaviour handed the entire management API to an unauthenticated caller — including the
  // routes that mint API keys.
  //
  // Onboarding is unaffected: /api/settings is admitted by its own carve-out in the middleware
  // (proxy.ts:91-97), which is what actually lets a passwordless install set a password.
  await withSettings({ setupComplete: true, password: "" }, async () => {
    assert.equal(await isAuthRequired(), true);
  });
});

test("INITIAL_PASSWORD counts as having a password", async () => {
  await withSettings({ setupComplete: false, password: "" }, async () => {
    process.env.INITIAL_PASSWORD = "from-env";
    assert.equal(await isAuthRequired(), true, "an env-provisioned password is a password");
  });
});

test("the /api and /dashboard policies now agree", async () => {
  // proxy.ts admits an unauthenticated dashboard request only when
  //   requireLogin !== false && !setupComplete && !password && !INITIAL_PASSWORD
  // so isAuthRequired must be false in exactly the same cases and no others.
  const dashboardWouldAdmit = (s) =>
    s.requireLogin === false || (!s.setupComplete && !s.password && !s.initialPassword);

  const cases = [
    { requireLogin: true, setupComplete: false, password: "" },
    { requireLogin: true, setupComplete: true, password: "" },
    { requireLogin: true, setupComplete: false, password: "hashed" },
    { requireLogin: true, setupComplete: true, password: "hashed" },
    { requireLogin: false, setupComplete: true, password: "hashed" },
    { requireLogin: false, setupComplete: false, password: "" },
  ];

  for (const c of cases) {
    await withSettings(c, async () => {
      const apiRequiresAuth = await isAuthRequired();
      const expected = !dashboardWouldAdmit({ ...c, initialPassword: false });
      assert.equal(
        apiRequiresAuth,
        expected,
        `divergence on ${JSON.stringify(c)}: /api ${apiRequiresAuth ? "requires" : "skips"} auth, dashboard would ${expected ? "redirect" : "admit"}`
      );
    });
  }
});

test("a settings read failure requires auth rather than opening up", async () => {
  // Already the behaviour, pinned because it is the one branch where a bug fails open.
  await withSettings({ setupComplete: true, password: "hashed" }, async () => {
    assert.equal(await isAuthRequired(), true);
  });
});
