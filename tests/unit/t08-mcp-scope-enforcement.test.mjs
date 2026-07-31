import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateToolScopes,
  resolveCallerScopeContext,
} from "../../open-sse/mcp-server/scopeEnforcement.ts";

test("resolveCallerScopeContext prioritizes authInfo scopes", () => {
  const context = resolveCallerScopeContext(
    {
      authInfo: {
        clientId: "client-auth",
        scopes: ["read:health", "read:combos"],
      },
      _meta: { scopes: ["write:combos"] },
      sessionId: "session-1",
    },
    ["read:usage"]
  );

  assert.equal(context.callerId, "client-auth");
  assert.equal(context.source, "authInfo");
  assert.deepEqual(context.scopes, ["read:health", "read:combos"]);
});

test("resolveCallerScopeContext ignores _meta scopes and uses the trusted fallback", () => {
  // `_meta` travels inside the JSON-RPC request and the HTTP transport does not authenticate,
  // so scopes found there are self-asserted. Honouring them made the check
  // `attacker_supplied_scopes ⊇ required_scopes`.
  const context = resolveCallerScopeContext(
    {
      _meta: {
        scopes: ["read:quota", "read:models"],
      },
      sessionId: "session-meta",
    },
    ["read:usage"]
  );

  assert.equal(context.callerId, "session-meta");
  assert.equal(context.source, "env");
  assert.deepEqual(context.scopes, ["read:usage"]);
});

test("resolveCallerScopeContext honours _meta scopes only behind the explicit dev flag", () => {
  const previous = process.env.ROUTIFORM_MCP_TRUST_META_SCOPES;
  process.env.ROUTIFORM_MCP_TRUST_META_SCOPES = "true";
  try {
    const context = resolveCallerScopeContext(
      { _meta: { scopes: ["read:quota"] }, sessionId: "session-meta" },
      ["read:usage"]
    );
    assert.equal(context.source, "meta");
    assert.deepEqual(context.scopes, ["read:quota"]);
  } finally {
    if (previous === undefined) delete process.env.ROUTIFORM_MCP_TRUST_META_SCOPES;
    else process.env.ROUTIFORM_MCP_TRUST_META_SCOPES = previous;
  }
});

test("resolveCallerScopeContext uses env fallback when caller has no scopes", () => {
  const context = resolveCallerScopeContext({ sessionId: "session-env" }, ["read:health"]);
  assert.equal(context.source, "env");
  assert.deepEqual(context.scopes, ["read:health"]);
});

test("evaluateToolScopes allows requests when enforcement is disabled", () => {
  const check = evaluateToolScopes("routiform_switch_combo", [], false);
  assert.equal(check.allowed, true);
  assert.deepEqual(check.missing, []);
});

test("evaluateToolScopes denies tool execution when required scope is missing", () => {
  const check = evaluateToolScopes("routiform_switch_combo", ["read:combos"], true);
  assert.equal(check.allowed, false);
  assert.ok(check.missing.includes("write:combos"));
  assert.equal(check.reason, "missing_scopes");
});

test("evaluateToolScopes supports wildcard scopes", () => {
  const check = evaluateToolScopes("routiform_get_health", ["read:*"], true);
  assert.equal(check.allowed, true);
  assert.deepEqual(check.missing, []);
});

test("evaluateToolScopes denies unknown tool names", () => {
  const check = evaluateToolScopes("routiform_unknown_tool", ["*"], true);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "tool_definition_missing");
});
