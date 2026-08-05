import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `POST /api/acp/agents` used to validate against `jsonObjectSchema` — a bare
 * `Record<string, unknown>` — so the agent shape was checked by hand inside the handler and the
 * only thing between operator input and a stored command this host executes was that hand-written
 * check. The shape now lives in `customAgentSchema`, and its `versionCommand` rule reuses the same
 * tokenizer the executor uses, so the boundary check and the pre-execution check cannot drift.
 */

const { acpAgentRequestSchema, customAgentSchema } =
  await import("../../src/shared/validation/schemas/acp-agent.ts");
const { validateBody, isValidationFailure } =
  await import("../../src/shared/validation/helpers.ts");
const { setCustomAgents, refreshAgentCache, getAgentById } =
  await import("../../src/lib/acp/registry.ts");

const VALID_AGENT = {
  id: "MyTool",
  name: "My Tool",
  binary: "mytool",
  versionCommand: "mytool --version",
};

test("a plain agent definition validates", () => {
  const result = validateBody(acpAgentRequestSchema, VALID_AGENT);
  assert.ok(!isValidationFailure(result));
  assert.equal(result.data.versionCommand, "mytool --version");
});

test("optional fields round-trip", () => {
  const result = validateBody(acpAgentRequestSchema, {
    ...VALID_AGENT,
    providerAlias: "mytool-alias",
    spawnArgs: ["--stdio", "--quiet"],
    protocol: "http",
  });
  assert.ok(!isValidationFailure(result));
  assert.deepEqual(result.data.spawnArgs, ["--stdio", "--quiet"]);
  assert.equal(result.data.protocol, "http");
  assert.equal(result.data.providerAlias, "mytool-alias");
});

test("the refresh action is not forced through the agent shape", () => {
  const result = validateBody(acpAgentRequestSchema, { action: "refresh" });
  assert.ok(!isValidationFailure(result));
  assert.equal(result.data.action, "refresh");
});

// Each of these is a command string that means something other than "run this binary with these
// arguments". They must be refused at the boundary, not stored and executed later.
const INJECTIONS = [
  "mytool --version; touch /tmp/pwned",
  "mytool --version && curl evil.example",
  "mytool --version | sh",
  "mytool --version > /etc/passwd",
  "mytool --version < /etc/passwd",
  "mytool --version `id`",
  "mytool --version $(id)",
  "mytool --version & id",
  "mytool --version\nid",
  "sh -c 'id'",
  'sh -c "id"',
];

for (const versionCommand of INJECTIONS) {
  test(`versionCommand is rejected: ${JSON.stringify(versionCommand)}`, () => {
    const result = validateBody(acpAgentRequestSchema, { ...VALID_AGENT, versionCommand });
    assert.ok(isValidationFailure(result), "must not validate");
  });
}

test("required fields are enforced", () => {
  for (const missing of ["id", "name", "binary", "versionCommand"]) {
    const body = { ...VALID_AGENT };
    delete body[missing];
    const result = validateBody(acpAgentRequestSchema, body);
    assert.ok(isValidationFailure(result), `${missing} must be required`);
  }
});

test("an empty or whitespace versionCommand is rejected", () => {
  for (const versionCommand of ["", "   "]) {
    const result = validateBody(customAgentSchema, { ...VALID_AGENT, versionCommand });
    assert.ok(isValidationFailure(result));
  }
});

test("an unknown protocol is rejected", () => {
  const result = validateBody(customAgentSchema, { ...VALID_AGENT, protocol: "grpc" });
  assert.ok(isValidationFailure(result));
});

/**
 * End-to-end through the executor: a stored command is run as argv, so a real script on PATH is
 * detected, while a command that cannot be tokenized is never executed and reads as not installed.
 */
test("detection runs a stored command as argv and refuses an untokenizable one", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX shebang script");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "routiform-acp-probe-"));
  const probe = join(dir, "routiform-probe");
  writeFileSync(probe, '#!/bin/sh\necho "routiform-probe 9.9.9"\n');
  chmodSync(probe, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;

  try {
    setCustomAgents([
      {
        id: "probe-ok",
        name: "Probe OK",
        binary: "routiform-probe",
        versionCommand: "routiform-probe --version",
        providerAlias: "probe-ok",
        spawnArgs: [],
        protocol: "stdio",
      },
      {
        id: "probe-injected",
        name: "Probe Injected",
        binary: "routiform-probe",
        versionCommand: "routiform-probe --version; echo pwned",
        providerAlias: "probe-injected",
        spawnArgs: [],
        protocol: "stdio",
      },
    ]);
    refreshAgentCache();

    const ok = getAgentById("probe-ok");
    assert.ok(ok, "the custom agent must be present");
    assert.equal(ok.installed, true, "an argv-invoked script must be detected");
    assert.equal(ok.version, "9.9.9");

    const injected = getAgentById("probe-injected");
    assert.ok(injected);
    assert.equal(injected.installed, false, "an untokenizable command must never be executed");
    assert.equal(injected.version, null);
  } finally {
    process.env.PATH = originalPath;
    // setCustomAgents invalidates the cache on its own — re-detecting here would just pay for
    // another full probe sweep.
    setCustomAgents([]);
    rmSync(dir, { recursive: true, force: true });
  }
});
