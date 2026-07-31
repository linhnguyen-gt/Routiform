import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveCallerScopeContext,
  evaluateToolScopes,
  META_SCOPE_TRUST_ENV,
} from "../scopeEnforcement.ts";

const ORIGINAL_TRUST = process.env[META_SCOPE_TRUST_ENV];

afterEach(() => {
  if (ORIGINAL_TRUST === undefined) delete process.env[META_SCOPE_TRUST_ENV];
  else process.env[META_SCOPE_TRUST_ENV] = ORIGINAL_TRUST;
});

describe("caller scope resolution", () => {
  beforeEach(() => {
    delete process.env[META_SCOPE_TRUST_ENV];
  });

  it("takes scopes from a server-trusted authInfo", () => {
    const ctx = resolveCallerScopeContext({
      authInfo: { clientId: "key-1", scopes: ["combos:read"] },
    });
    expect(ctx.source).toBe("authInfo");
    expect(ctx.scopes).toEqual(["combos:read"]);
  });

  it("ignores scopes supplied in the request's own _meta", () => {
    // The HTTP transport does not authenticate, so _meta is attacker-controlled. Honouring it
    // makes the check `attacker_supplied_scopes ⊇ required_scopes`.
    const ctx = resolveCallerScopeContext({
      _meta: { routiform: { scopes: ["*"] } },
      sessionId: "sess-1",
    });
    expect(ctx.scopes).toEqual([]);
    expect(ctx.source).not.toBe("meta");
  });

  it("ignores every _meta shape, not just the routiform one", () => {
    for (const meta of [
      { scopes: ["*"] },
      { auth: { scopes: ["*"] } },
      { routiform: { scopes: ["*"] } },
    ]) {
      expect(resolveCallerScopeContext({ _meta: meta }).scopes).toEqual([]);
    }
  });

  it("honours _meta only behind the explicit dev flag", () => {
    process.env[META_SCOPE_TRUST_ENV] = "true";
    const ctx = resolveCallerScopeContext({ _meta: { routiform: { scopes: ["read:combos"] } } });
    expect(ctx.source).toBe("meta");
    expect(ctx.scopes).toEqual(["read:combos"]);
  });

  it("prefers authInfo over the env fallback", () => {
    const ctx = resolveCallerScopeContext({ authInfo: { scopes: ["combos:read"] } }, ["*"]);
    expect(ctx.source).toBe("authInfo");
  });

  it("falls back to the configured env scopes when nothing is bound", () => {
    const ctx = resolveCallerScopeContext(undefined, ["read:health"]);
    expect(ctx.source).toBe("env");
    expect(ctx.scopes).toEqual(["read:health"]);
  });
});

describe("tool scope evaluation", () => {
  it("allows a tool with no definition when enforcement is off", () => {
    // Memory tools are registered but absent from MCP_TOOLS; the missing-definition check used to
    // fire before the enforcement short-circuit, so they were denied even with enforcement off.
    const result = evaluateToolScopes("routiform_memory_search", [], false);
    expect(result.allowed).toBe(true);
  });

  it("still denies a tool with no definition when enforcement is on", () => {
    const result = evaluateToolScopes("routiform_not_a_tool", ["*"], true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("tool_definition_missing");
  });

  it("grants a known tool when the caller holds its scope", () => {
    const result = evaluateToolScopes("routiform_list_combos", ["read:combos"], true);
    expect(result.allowed).toBe(true);
  });

  it("denies a known tool when the scope is missing", () => {
    const result = evaluateToolScopes("routiform_list_combos", ["read:health"], true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing_scopes");
    expect(result.missing).toContain("read:combos");
  });

  it("supports prefix and full wildcards", () => {
    expect(evaluateToolScopes("routiform_list_combos", ["read:*"], true).allowed).toBe(true);
    expect(evaluateToolScopes("routiform_list_combos", ["*"], true).allowed).toBe(true);
  });
});
