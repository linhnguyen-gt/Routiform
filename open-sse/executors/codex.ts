import { BaseExecutor, type ExecuteInput } from "./base.ts";
import { HTTP_STATUS, PROVIDERS } from "../config/constants.ts";
import {
  getResponsesSubpath,
  isCompactResponsesEndpoint,
} from "../services/codex-request-shaping.ts";
import { transformCodexRequestBody } from "../services/codex-request-transform.ts";
import { peekCodexSseTransientError } from "../services/codex-sse-peek.ts";
import { getAccessToken } from "../services/tokenRefresh.ts";

// Re-exported for backward compatibility: rate-limit scope + quota-header
// helpers used to live here and are imported from this module elsewhere.
export {
  getCodexModelScope,
  getCodexRateLimitKey,
  getCodexResetTime,
  parseCodexQuotaHeaders,
  type CodexQuotaSnapshot,
} from "../services/codex-quota.ts";

// Bounded same-account retry policy for the 200-OK SSE "overloaded" error
// surfaced by the peek (see services/codex-sse-peek.ts).
const CODEX_SSE_RETRY_MAX_ATTEMPTS = 2;
const CODEX_SSE_RETRY_DELAY_MS = 1000;
const CODEX_CAPACITY_MESSAGE = "Selected model is at capacity. Please try a different model.";
const CODEX_OVERLOADED_MESSAGE = "Upstream is overloaded. Please retry.";

/**
 * Codex Executor - handles OpenAI Codex API (Responses API format)
 * Automatically injects default instructions if missing.
 * IMPORTANT: Includes chatgpt-account-id header for workspace binding.
 */
export class CodexExecutor extends BaseExecutor {
  constructor() {
    super("codex", PROVIDERS.codex);
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    void model;
    void stream;
    void urlIndex;

    const responsesSubpath = getResponsesSubpath(credentials?.requestEndpointPath);
    if (responsesSubpath !== null) {
      const baseUrl = String(this.config.baseUrl || "").replace(/\/$/, "");
      if (baseUrl.endsWith("/responses")) {
        return `${baseUrl}${responsesSubpath}`;
      }
      return `${baseUrl}/responses${responsesSubpath}`;
    }

    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  /**
   * Codex Responses endpoint is SSE-first.
   * Always request event-stream from upstream, even when client requested stream=false.
   * Includes chatgpt-account-id header for strict workspace binding.
   */
  buildHeaders(credentials, _stream = true) {
    const isCompactRequest = isCompactResponsesEndpoint(credentials?.requestEndpointPath);
    const headers = super.buildHeaders(credentials, isCompactRequest ? false : true);

    // Add workspace binding header if workspaceId is persisted
    const workspaceId = credentials?.providerSpecificData?.workspaceId;
    if (workspaceId) {
      headers["chatgpt-account-id"] = workspaceId;
    }

    // Codex originator + session_id prompt-cache-affinity headers
    headers["originator"] = "codex_cli_rs";
    headers["x-codex-version"] = "0.124.0";

    // Installation ID for client identification
    const installationId = credentials?.providerSpecificData?.installationId;
    if (installationId && typeof installationId === "string") {
      headers["x-codex-installation-id"] = installationId;
    }

    const sessionId = credentials?.providerSpecificData?.ccSessionId;
    if (sessionId && typeof sessionId === "string") {
      headers["session_id"] = sessionId;
    }

    return headers;
  }

  /**
   * Refresh Codex OAuth credentials when a 401 is received.
   * OpenAI uses rotating (one-time-use) refresh tokens — if the token was already
   * consumed by a concurrent refresh, this returns null to signal re-auth is needed.
   *
   * Fixes #251: After a server restart/upgrade, previously cached access tokens may
   * have expired or become invalid. chatCore.ts calls this on 401; previously the
   * base class returned null causing the request to fail instead of refreshing.
   */
  async refreshCredentials(credentials, log) {
    if (!credentials?.refreshToken) {
      log?.warn?.("TOKEN_REFRESH", "Codex: no refresh token available, re-authentication required");
      return null;
    }
    const result = await getAccessToken("codex", credentials, log);
    if (!result || result.error) {
      log?.warn?.(
        "TOKEN_REFRESH",
        `Codex: token refresh failed${result?.error ? ` (${result.error})` : ""} — re-authentication required`
      );
      return null;
    }
    return result;
  }

  /**
   * Codex Responses endpoint sometimes answers with HTTP 200 whose *SSE body*
   * carries the real failure instead of a proper status code. Peek the first
   * bytes of the stream to catch this before it silently reaches the client
   * as an empty response with no retry and no account failover.
   *
   * - "server_is_overloaded" → transient, retry on the SAME account (bounded).
   * - "Selected model is at capacity" → convert to 503 so the existing
   *   account-rotation logic (triggered by SERVICE_UNAVAILABLE) picks a
   *   different account instead of forwarding the error verbatim.
   *
   * Fail-open by construction: a non-ok/bodyless response, a size overrun, or
   * a read/decode error all leave `matched` as `null`, so we fall through and
   * forward the reassembled original bytes untouched. The peek must never
   * become a new failure mode.
   */
  async execute(input: ExecuteInput) {
    let attempt = 0;
    for (;;) {
      const result = await super.execute(input);
      const peek = await this._peekSseTransientError(result.response);

      if (!peek.matched) {
        if (peek.replacementBody) {
          result.response = new Response(peek.replacementBody, {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: result.response.headers,
          });
        }
        return result;
      }

      if (peek.matched === "account-fallback") {
        input.log?.warn?.(
          "CODEX",
          `SSE 200-OK capacity error detected — surfacing as ${HTTP_STATUS.SERVICE_UNAVAILABLE} to trigger account rotation`
        );
        result.response = this._codexSseErrorResponse(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          CODEX_CAPACITY_MESSAGE
        );
        return result;
      }

      // matched === "retry": server_is_overloaded — retry the same account.
      if (attempt >= CODEX_SSE_RETRY_MAX_ATTEMPTS) {
        input.log?.warn?.(
          "CODEX",
          `SSE overloaded — retries exhausted (${attempt}/${CODEX_SSE_RETRY_MAX_ATTEMPTS}), surfacing as ${HTTP_STATUS.SERVICE_UNAVAILABLE}`
        );
        result.response = this._codexSseErrorResponse(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          CODEX_OVERLOADED_MESSAGE
        );
        return result;
      }

      attempt++;
      input.log?.debug?.(
        "CODEX",
        `SSE overloaded — retry ${attempt}/${CODEX_SSE_RETRY_MAX_ATTEMPTS} on same account after ${CODEX_SSE_RETRY_DELAY_MS}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, CODEX_SSE_RETRY_DELAY_MS));
    }
  }

  _codexSseErrorResponse(status: number, message: string): Response {
    return new Response(
      JSON.stringify({
        error: {
          message,
          type: status >= 500 ? "server_error" : "invalid_request_error",
          code:
            status === HTTP_STATUS.SERVICE_UNAVAILABLE ? "service_unavailable" : "upstream_error",
        },
      }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  /**
   * Peek the START of an SSE body for a 200-OK transient error, reassembling a
   * byte-identical replacement stream when nothing matched. The reader/stream
   * lifecycle invariants live in services/codex-sse-peek.ts — read the comments
   * there before touching that code.
   */
  async _peekSseTransientError(response: Response) {
    return peekCodexSseTransientError(response);
  }

  /**
   * Transform request before sending - inject default instructions if missing
   */
  transformRequest(model, body, stream, credentials) {
    void stream;
    return transformCodexRequestBody(model, body, credentials);
  }
}
