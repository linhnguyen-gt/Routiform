/**
 * Claude Code nested helpers (REPL, compact, title gen, Haiku apply) send
 * /v1/messages with tools:[] and a small/fast model that resolves to provider
 * "claude". Without OAuth that 400s. Route those to an active combo instead.
 */

type JsonRecord = Record<string, unknown>;

export type HelperComboCandidate = {
  name?: string;
  models?: unknown[];
  isActive?: boolean;
  isHidden?: boolean;
};

export function isNestedHelperRequest(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  const tools = body.tools;
  return !(Array.isArray(tools) && tools.length > 0);
}

export function helperNeedsComboFallback(options: {
  combo: unknown;
  body: JsonRecord;
  provider: string | null | undefined;
  hasClaudeCredentials: boolean;
}): boolean {
  if (options.combo) return false;
  if (!isNestedHelperRequest(options.body)) return false;
  const provider = options.provider || "";
  if (provider !== "claude" && provider !== "cc") return false;
  return !options.hasClaudeCredentials;
}

export function pickActiveCombo<T extends HelperComboCandidate>(combos: T[]): T | null {
  for (const combo of combos) {
    if (combo.isActive === false || combo.isHidden === true) continue;
    if (!Array.isArray(combo.models) || combo.models.length === 0) continue;
    return combo;
  }
  return null;
}

export function hasUsableClaudeCredentials(creds: Record<string, unknown> | null): boolean {
  if (!creds || creds.allRateLimited === true) return false;
  return (
    (typeof creds.apiKey === "string" && creds.apiKey.length > 0) ||
    (typeof creds.accessToken === "string" && creds.accessToken.length > 0)
  );
}
