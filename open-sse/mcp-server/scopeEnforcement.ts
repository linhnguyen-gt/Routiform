import { MCP_TOOL_MAP } from "./schemas/tools.ts";

type AuthInfoLike = {
  clientId?: string;
  scopes?: string[];
};

export type McpToolExtraLike = {
  authInfo?: AuthInfoLike;
  sessionId?: string;
  _meta?: unknown;
};

export type ScopeSource = "authInfo" | "meta" | "transport" | "none";

export interface CallerScopeContext {
  callerId: string;
  scopes: string[];
  source: ScopeSource;
}

export interface ScopeCheckResult {
  allowed: boolean;
  required: string[];
  provided: string[];
  missing: string[];
  reason?: string;
}

function normalizeScopeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

/**
 * Opt-in flag that restores the legacy behaviour of reading scopes from the request's own `_meta`.
 * Development only: `_meta` travels inside the JSON-RPC request, so a caller can name its own
 * scopes and the check degrades to `attacker_supplied_scopes ⊇ required_scopes`. Hard-disabled
 * in production regardless of the flag.
 */
export const META_SCOPE_TRUST_ENV = "ROUTIFORM_MCP_TRUST_META_SCOPES";

function metaScopesTrusted(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[META_SCOPE_TRUST_ENV] === "true";
}

function extractMetaScopeList(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const metaRecord = meta as Record<string, unknown>;

  const direct = normalizeScopeList(metaRecord.scopes);
  if (direct.length > 0) return direct;

  const auth = metaRecord.auth;
  if (auth && typeof auth === "object") {
    const authScopes = normalizeScopeList((auth as Record<string, unknown>).scopes);
    if (authScopes.length > 0) return authScopes;
  }

  const routi = metaRecord.routiform;
  if (routi && typeof routi === "object") {
    const routiScopes = normalizeScopeList((routi as Record<string, unknown>).scopes);
    if (routiScopes.length > 0) return routiScopes;
  }

  return [];
}

function scopeMatches(grantedScope: string, requiredScope: string): boolean {
  if (grantedScope === "*" || grantedScope === requiredScope) {
    return true;
  }
  if (grantedScope.endsWith("*")) {
    const prefix = grantedScope.slice(0, -1);
    return requiredScope.startsWith(prefix);
  }
  return false;
}

/**
 * Resolve the caller's effective scopes.
 *
 * Order: server-bound `authInfo` (set by the HTTP transport after bearer-key validation),
 * then caller-supplied `_meta` behind the dev-only trust flag, then `trustedScopes` — which is
 * NOT an env grant. Only the stdio entry point passes it, deriving full tool scopes from the
 * transport being local and trusted. HTTP callers without a bound identity get empty scopes
 * and are denied by enforcement.
 */
export function resolveCallerScopeContext(
  extra: McpToolExtraLike | undefined,
  trustedScopes: readonly string[] = []
): CallerScopeContext {
  const callerId =
    (typeof extra?.authInfo?.clientId === "string" && extra.authInfo.clientId.trim()) ||
    (typeof extra?.sessionId === "string" && extra.sessionId.trim()) ||
    "anonymous";

  const authScopes = normalizeScopeList(extra?.authInfo?.scopes);
  if (authScopes.length > 0) {
    return { callerId, scopes: authScopes, source: "authInfo" };
  }

  // `_meta` is part of the request body, so scopes found there are self-asserted by the caller.
  // They are ignored unless explicitly trusted, and never in production.
  if (metaScopesTrusted()) {
    const metaScopes = extractMetaScopeList(extra?._meta);
    if (metaScopes.length > 0) {
      console.warn(
        `[mcp] ${META_SCOPE_TRUST_ENV}=true: honouring caller-supplied scopes [${metaScopes.join(", ")}] ` +
          `for caller "${callerId}". These are not verified. Never enable this outside development.`
      );
      return { callerId, scopes: metaScopes, source: "meta" };
    }
  }

  const trusted = normalizeScopeList(trustedScopes);
  if (trusted.length > 0) {
    return { callerId, scopes: trusted, source: "transport" };
  }

  return { callerId, scopes: [], source: "none" };
}

export function evaluateToolScopes(
  toolName: string,
  callerScopes: readonly string[],
  enforceScopes: boolean
): ScopeCheckResult {
  const toolDef = MCP_TOOL_MAP[toolName];
  const required = toolDef && Array.isArray(toolDef.scopes) ? Array.from(toolDef.scopes) : [];
  const provided = normalizeScopeList(callerScopes);

  // Enforcement off means every registered tool is callable. A tool that is registered on the
  // server but absent from MCP_TOOLS has no scope declaration, not a failed scope check — denying
  // it here made those tools unusable even with enforcement disabled.
  if (!enforceScopes) {
    return { allowed: true, required, provided, missing: [] };
  }

  // With enforcement on, an undeclared tool cannot be checked and so cannot be permitted.
  if (!toolDef) {
    return {
      allowed: false,
      required: [],
      provided,
      missing: [],
      reason: "tool_definition_missing",
    };
  }

  if (required.length === 0) {
    return { allowed: true, required, provided, missing: [] };
  }

  const missing = required.filter(
    (requiredScope) => !provided.some((grantedScope) => scopeMatches(grantedScope, requiredScope))
  );

  return {
    allowed: missing.length === 0,
    required,
    provided,
    missing,
    reason: missing.length > 0 ? "missing_scopes" : undefined,
  };
}
