import { generateSessionId } from "./sessionManager.ts";

/**
 * Per-caller conversation identity, or null when none can be derived.
 *
 * Two tiers, both already present in the codebase (see the Phase 00 spike):
 *
 * 1. An explicit client header. Claude Code sends `x-claude-code-session-id` on every request of
 *    a session, and `claudeHeaderCache.ts` already treats it as identity.
 * 2. `generateSessionId`'s content fingerprint — model, provider, system prompt hash, FIRST USER
 *    MESSAGE hash, tool signature. The first-user-message component is what makes it a
 *    conversation key rather than a prompt-prefix key: a prefix hash collides across every
 *    conversation that shares a system prompt, which is a whole tenant's traffic.
 *
 * What this deliberately does NOT do is fabricate. `resolveClaudeCodeCompatibleSessionId` returns
 * `randomUUID()` when no header is present, which is right for the upstream session id it feeds
 * and wrong here: a fresh value per request is not an identity, it is a guarantee that every
 * lookup misses while the field looks meaningful to the next reader. Null is the honest answer,
 * and callers must treat it as "this feature is off for this request".
 *
 * Collision caveat, stated rather than buried: two conversations opening with a byte-identical
 * first user message against the same model produce the same fingerprint. Real for boilerplate
 * openers. Anything keyed on this must also carry the tenant dimension AND verify content before
 * acting on a match — the identity narrows the search, it does not authorize a substitution.
 */

const SESSION_HEADERS = [
  "x-claude-code-session-id",
  "x-session-id",
  "x_session_id",
  "x-routiform-session",
] as const;

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get?: (name: string) => string | null }
  | null
  | undefined;

function readHeader(headers: HeaderLike, name: string): string | null {
  if (!headers) return null;

  const getter = (headers as Headers).get;
  if (typeof getter === "function") {
    return (headers as Headers).get(name);
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== wanted) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
  return null;
}

export interface ConversationIdentityOptions {
  provider?: string;
  connectionId?: string | null;
}

export function resolveConversationId(
  headers: HeaderLike,
  body: Record<string, unknown> | null | undefined,
  options: ConversationIdentityOptions = {}
): string | null {
  for (const name of SESSION_HEADERS) {
    const raw = readHeader(headers, name);
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed) return trimmed;
  }

  const fingerprint = generateSessionId(body as never, {
    provider: options.provider,
    connectionId: options.connectionId ?? undefined,
  });
  return fingerprint || null;
}
