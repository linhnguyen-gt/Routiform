/**
 * MCP HTTP Transport Layer — session-aware handlers for SSE and Streamable HTTP.
 *
 * Runs the MCP server **inside** the Next.js process so it can be toggled
 * from the dashboard without requiring `routiform --mcp`.
 *
 * Transport modes:
 *   - SSE:             GET /api/mcp/sse (event stream)  +  POST /api/mcp/sse (messages)
 *   - Streamable HTTP: POST /api/mcp/stream (messages)  +  GET /api/mcp/stream (SSE stream)  +  DELETE /api/mcp/stream (session end)
 *
 * Security model:
 *   - Every HTTP request must carry `Authorization: Bearer <api key>` validated against the
 *     same API-keys store the gateway routes use. Unauthenticated requests get 401 before any
 *     session is created.
 *   - Each JSON-RPC session is bound to the validated key: its id and derived scopes are
 *     injected into tool-handler `extra.authInfo`, which is what scope enforcement reads.
 *   - Sessions are capped and swept after an idle timeout to bound memory.
 */

import { randomUUID } from "node:crypto";
import { createMcpServer } from "./server.ts";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateApiKey, getApiKeyMetadata } from "@/lib/db/apiKeys";
import { MCP_TOOL_MAP } from "./schemas/tools.ts";
import { getAuditStatus } from "./audit.ts";

/** Maximum concurrently live sessions; initialize beyond this returns 429. */
const MAX_SESSIONS = 100;

/** A session that has seen no request for this long is swept. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

export type McpHttpMode = "sse" | "streamable-http";

interface McpCallerAuth {
  clientId: string;
  scopes: string[];
}

type StreamableSession = {
  sessionId: string;
  mode: McpHttpMode;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  auth: McpCallerAuth;
  startedAt: number;
  lastSeenAt: number;
};

const _streamableSessions = new Map<string, StreamableSession>();

// ──────────────── Authentication ────────────────

/**
 * Full scope manifest across every registered tool. Used as the default grant for a validated
 * API key; ROUTIFORM_MCP_SCOPES narrows it when the operator configures a smaller manifest.
 */
function fullToolScopes(): string[] {
  return Array.from(new Set(Object.values(MCP_TOOL_MAP).flatMap((tool) => [...tool.scopes])));
}

function deriveCallerScopes(): string[] {
  const manifest = (process.env.ROUTIFORM_MCP_SCOPES || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  return manifest.length > 0 ? manifest : fullToolScopes();
}

type AuthResult = { ok: true; auth: McpCallerAuth } | { ok: false; response: Response };

async function authenticateRequest(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const key = match?.[1]?.trim();

  if (!key) {
    return {
      ok: false,
      response: unauthorizedResponse("Unauthorized: Bearer API key required"),
    };
  }

  try {
    if (!(await validateApiKey(key))) {
      return {
        ok: false,
        response: unauthorizedResponse("Unauthorized: invalid API key"),
      };
    }
    const metadata = await getApiKeyMetadata(key);
    if (!metadata?.id) {
      return {
        ok: false,
        response: unauthorizedResponse("Unauthorized: invalid API key"),
      };
    }
    return { ok: true, auth: { clientId: metadata.id, scopes: deriveCallerScopes() } };
  } catch (err) {
    console.error("[MCP] API key validation failed:", err instanceof Error ? err.message : err);
    return {
      ok: false,
      response: unauthorizedResponse("Unauthorized: authentication backend unavailable"),
    };
  }
}

function unauthorizedResponse(message: string): Response {
  return errorResponse(message, -32001, 401, { "WWW-Authenticate": "Bearer" });
}

// ──────────────── Session lifecycle ────────────────

function closeStreamableSession(sessionId: string): void {
  const session = _streamableSessions.get(sessionId);
  if (!session) {
    return;
  }

  try {
    session.transport.close();
  } catch {
    // ignore shutdown errors
  }
  _streamableSessions.delete(sessionId);
}

function closeAllStreamableSessions(): void {
  for (const sessionId of _streamableSessions.keys()) {
    closeStreamableSession(sessionId);
  }
}

/** Close sessions idle longer than SESSION_IDLE_MS. Called on every inbound request. */
function sweepIdleSessions(now = Date.now()): void {
  for (const [sessionId, session] of _streamableSessions) {
    if (now - session.lastSeenAt > SESSION_IDLE_MS) {
      closeStreamableSession(sessionId);
    }
  }
}

function createStreamableSession(mode: McpHttpMode, auth: McpCallerAuth): StreamableSession {
  const sessionId = randomUUID();
  const server = createMcpServer({ transport: "http", authInfo: auth });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });
  const now = Date.now();
  const session = {
    sessionId,
    mode,
    server,
    transport,
    auth,
    startedAt: now,
    lastSeenAt: now,
  };

  void server.connect(transport);
  _streamableSessions.set(sessionId, session);
  console.log(`[MCP] HTTP transport started (${mode})`);
  return session;
}

async function isInitializeRequest(request: Request): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }

  try {
    const body = (await request.clone().json()) as { method?: unknown };
    return body?.method === "initialize";
  } catch {
    return false;
  }
}

// ──────────────── Response helpers ────────────────

function errorResponse(
  message: string,
  code: number,
  status = 400,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }
  );
}

function withSessionHeader(response: Response, sessionId: string): Response {
  if (response.headers.get("mcp-session-id")) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("mcp-session-id", sessionId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ──────────────── Request handling ────────────────

/**
 * Shared handler for both HTTP endpoints. SSE and Streamable HTTP differ only in the route
 * path; both speak the Streamable HTTP wire protocol (POST messages / GET stream / DELETE end),
 * so both go through the same authenticated per-session machinery.
 */
async function handleStreamableRequest(request: Request, mode: McpHttpMode): Promise<Response> {
  const authResult = await authenticateRequest(request);
  if (authResult.ok === false) {
    return authResult.response;
  }

  sweepIdleSessions();

  const sessionId = request.headers.get("mcp-session-id");

  if (sessionId) {
    const session = _streamableSessions.get(sessionId);
    if (!session) {
      return errorResponse("Bad Request: Unknown Mcp-Session-Id header", -32000);
    }
    // Session-key binding: a valid key may not drive another key's session.
    if (session.auth.clientId !== authResult.auth.clientId) {
      return errorResponse("Forbidden: session belongs to a different API key", -32001, 403);
    }
    session.lastSeenAt = Date.now();

    try {
      const response = await session.transport.handleRequest(request);
      if (request.method === "DELETE") {
        closeStreamableSession(sessionId);
      }
      return withSessionHeader(response, sessionId);
    } catch (err) {
      console.error("[MCP] Streamable HTTP error:", err);
      if (request.method === "DELETE") {
        closeStreamableSession(sessionId);
      }
      return new Response(JSON.stringify({ error: "MCP transport error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!(await isInitializeRequest(request))) {
    return errorResponse("Bad Request: Mcp-Session-Id header is required", -32000);
  }

  if (_streamableSessions.size >= MAX_SESSIONS) {
    return errorResponse(`Too Many Requests: session limit (${MAX_SESSIONS}) reached`, -32000, 429);
  }

  const session = createStreamableSession(mode, authResult.auth);

  try {
    const response = await session.transport.handleRequest(request);
    // The transport registers the session before it validates the request, so a failed
    // initialize would otherwise hold a session slot until the idle sweep. Read the one-shot
    // JSON reply and release the session when the handshake itself errored.
    const payload = await response.text();
    let handshakeFailed = false;
    try {
      handshakeFailed = !!JSON.parse(payload)?.error;
    } catch {
      // Not JSON (empty/SSE): treat as success.
    }
    if (handshakeFailed) {
      closeStreamableSession(session.sessionId);
    }
    return withSessionHeader(
      new Response(payload, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      session.sessionId
    );
  } catch (err) {
    closeStreamableSession(session.sessionId);
    console.error("[MCP] Streamable HTTP error:", err);
    return new Response(JSON.stringify({ error: "MCP transport error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Handle Streamable HTTP requests (POST / GET / DELETE).
 * Used by the Next.js route at /api/mcp/stream.
 */
export async function handleMcpStreamableHTTP(request: Request): Promise<Response> {
  return handleStreamableRequest(request, "streamable-http");
}

/**
 * Handle SSE requests.
 * SSE transport is implemented via Streamable HTTP transport with GET for SSE stream
 * and POST for messages (the Streamable HTTP transport supports both patterns).
 */
export async function handleMcpSSE(request: Request): Promise<Response> {
  return handleStreamableRequest(request, "sse");
}

export function getMcpHttpStatus(): {
  online: boolean;
  transport: string | null;
  startedAt: number | null;
  uptime: string | null;
  sessions: number;
  auditEnabled: boolean;
} {
  const startedAt =
    _streamableSessions.size > 0
      ? Math.min(...Array.from(_streamableSessions.values(), (session) => session.startedAt))
      : null;
  const modes = new Set(Array.from(_streamableSessions.values(), (session) => session.mode));
  const transport =
    modes.size > 0 ? (modes.has("streamable-http") ? "streamable-http" : "sse") : null;
  const online = transport !== null;
  const audit = getAuditStatus();

  return {
    online,
    transport,
    startedAt,
    uptime: startedAt ? `${Math.floor((Date.now() - startedAt) / 1000)}s` : null,
    sessions: _streamableSessions.size,
    auditEnabled: audit.enabled,
  };
}

export function shutdownMcpHttp(): void {
  closeAllStreamableSessions();
  console.log("[MCP] HTTP transport shutdown");
}

export function isMcpHttpActive(): boolean {
  return _streamableSessions.size > 0;
}
