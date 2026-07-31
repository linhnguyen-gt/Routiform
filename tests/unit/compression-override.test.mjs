import test from "node:test";
import assert from "node:assert/strict";

/**
 * The per-request compression override, and the gate in front of it.
 *
 * Two separate things are being protected. The harness needs a genuinely uncompressed baseline or
 * it certifies every engine it measures. And the gateway must not let any caller disable
 * compression by adding a header, which is a cost regression anyone could trigger.
 */

const { resolveCompressionOverride, overrideToStackOptions, OVERRIDE_ALLOWLIST_ENV } =
  await import("../../open-sse/compression/override.ts");

const ORIGINAL = process.env[OVERRIDE_ALLOWLIST_ENV];

function withAllowlist(value, fn) {
  if (value === undefined) delete process.env[OVERRIDE_ALLOWLIST_ENV];
  else process.env[OVERRIDE_ALLOWLIST_ENV] = value;
  try {
    return fn();
  } finally {
    if (ORIGINAL === undefined) delete process.env[OVERRIDE_ALLOWLIST_ENV];
    else process.env[OVERRIDE_ALLOWLIST_ENV] = ORIGINAL;
  }
}

const header = (value) => ({ "X-Routiform-Compression-Mode": value });

// ── the gate ─────────────────────────────────────────────────────────────────

test("with no allowlist configured, nobody may override", () => {
  withAllowlist(undefined, () => {
    const outcome = resolveCompressionOverride(header("off"), "key-1");
    assert.equal(outcome.status, "denied");
    assert.match(outcome.reason, /unset/);
  });
});

test("an empty allowlist denies rather than admitting everyone", () => {
  withAllowlist("   ", () => {
    assert.equal(resolveCompressionOverride(header("off"), "key-1").status, "denied");
  });
});

test("a key that is not on the allowlist is denied", () => {
  withAllowlist("key-eval", () => {
    const outcome = resolveCompressionOverride(header("off"), "key-someone-else");
    assert.equal(outcome.status, "denied");
  });
});

test("an unauthenticated request is denied even when an allowlist exists", () => {
  withAllowlist("key-eval", () => {
    assert.equal(resolveCompressionOverride(header("off"), null).status, "denied");
    assert.equal(resolveCompressionOverride(header("off"), undefined).status, "denied");
    assert.equal(resolveCompressionOverride(header("off"), "").status, "denied");
  });
});

test("denied is a distinct outcome from absent, so it can be logged", () => {
  // A silently ignored override is the dangerous case: the caller believes compression is off,
  // the gateway keeps compressing, and the resulting measurement looks valid.
  withAllowlist("key-eval", () => {
    assert.equal(resolveCompressionOverride({}, "key-eval").status, "absent");
    assert.equal(resolveCompressionOverride(header("off"), "other").status, "denied");
  });
});

// ── parsing, once authorised ─────────────────────────────────────────────────

test("off disables every engine", () => {
  withAllowlist("key-eval", () => {
    const outcome = resolveCompressionOverride(header("off"), "key-eval");
    assert.equal(outcome.status, "applied");
    assert.deepEqual(outcome.override, { preset: "off" });
    assert.deepEqual(overrideToStackOptions(outcome.override), {
      preset: "off",
      engineToggles: null,
    });
  });
});

test("preset:<name> selects a named preset", () => {
  withAllowlist("key-eval", () => {
    for (const name of ["off", "safe", "balanced", "aggressive", "custom"]) {
      const outcome = resolveCompressionOverride(header(`preset:${name}`), "key-eval");
      assert.equal(outcome.status, "applied", name);
      assert.equal(outcome.override.preset, name);
    }
  });
});

test("engines:<ids> selects exactly those engines", () => {
  withAllowlist("key-eval", () => {
    const outcome = resolveCompressionOverride(header("engines:lite,rtk"), "key-eval");
    assert.equal(outcome.status, "applied");
    assert.deepEqual(overrideToStackOptions(outcome.override), {
      preset: "custom",
      engineToggles: { lite: true, rtk: true },
    });
  });
});

test("an unknown preset is invalid, not silently treated as off", () => {
  withAllowlist("key-eval", () => {
    // Falling back to `off` here would let a typo disable compression on a production gateway.
    const outcome = resolveCompressionOverride(header("preset:turbo"), "key-eval");
    assert.equal(outcome.status, "invalid");
    assert.match(outcome.reason, /turbo/);
  });
});

test("an unparseable value is invalid", () => {
  withAllowlist("key-eval", () => {
    for (const value of ["yes", "engines:", "preset:", "1"]) {
      assert.equal(resolveCompressionOverride(header(value), "key-eval").status, "invalid", value);
    }
  });
});

test("header lookup is case-insensitive and accepts a Headers instance", () => {
  withAllowlist("key-eval", () => {
    assert.equal(
      resolveCompressionOverride({ "x-routiform-compression-mode": "off" }, "key-eval").status,
      "applied"
    );
    const headers = new Headers({ "X-Routiform-Compression-Mode": "preset:safe" });
    assert.equal(resolveCompressionOverride(headers, "key-eval").status, "applied");
  });
});

test("multiple allowlisted keys are all honoured", () => {
  withAllowlist("key-a, key-b ,key-c", () => {
    for (const id of ["key-a", "key-b", "key-c"]) {
      assert.equal(resolveCompressionOverride(header("off"), id).status, "applied", id);
    }
    assert.equal(resolveCompressionOverride(header("off"), "key-d").status, "denied");
  });
});

// ── what the harness actually needs ──────────────────────────────────────────

test("an off override produces a response header the runner can assert on", async () => {
  const { applyStackedCompression, formatStackHeader } =
    await import("../../open-sse/compression/index.ts");

  // The runner refuses to score a pair whose baseline did not come back "off". This is the
  // producing half of that contract.
  const body = { messages: [{ role: "user", content: "please just really explain this" }] };
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "off",
  });

  assert.equal(result.mode, "off");
  assert.ok(formatStackHeader(result).startsWith("off"));
});

test("an off override leaves the request byte-identical", async () => {
  const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");
  const body = {
    messages: [
      { role: "user", content: "I would like to please just really explain    the    thing" },
      { role: "tool", content: "x".repeat(5000) },
    ],
  };
  const before = JSON.stringify(body);
  applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "off",
  });
  assert.equal(JSON.stringify(body), before, "the baseline arm must be genuinely uncompressed");
});
