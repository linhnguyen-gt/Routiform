import { PROVIDERS, OAUTH_ENDPOINTS } from "../../../config/constants.ts";
import { dispatchTokenRequest, mapSnakeCaseTokens } from "../dispatch.ts";

/**
 * Specialized refresh for Cline OAuth tokens.
 * Cline refresh endpoint expects JSON body and returns camelCase fields.
 */
export async function refreshClineToken(refreshToken, log, proxyConfig = null) {
  const refreshUrl = PROVIDERS.cline?.refreshUrl;
  if (!refreshUrl) {
    log?.warn?.("TOKEN_REFRESH", "No refresh URL configured for Cline");
    return null;
  }

  return dispatchTokenRequest({
    endpoint: refreshUrl,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refreshToken,
      grantType: "refresh_token",
    }),
    label: "Cline token",
    log,
    proxyConfig,
    mapResponse: (payload) => {
      if (!payload?.success) {
        log?.warn?.("TOKEN_REFRESH", "Cline refresh returned success: false", payload);
        return null;
      }

      const data = payload.data;
      if (!data?.accessToken) {
        log?.warn?.("TOKEN_REFRESH", "Cline refresh missing accessToken");
        return null;
      }

      const expiresAtIso = data?.expiresAt;
      const expiresIn = expiresAtIso
        ? Math.max(1, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000))
        : undefined;

      return {
        result: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || refreshToken,
          expiresIn,
        },
        info: { expiresIn },
      };
    },
  });
}

/**
 * Specialized refresh for Kimi Coding OAuth tokens.
 * Uses custom X-Msh-* headers required by Kimi OAuth API.
 */
export async function refreshKimiCodingToken(refreshToken, log, proxyConfig = null) {
  const endpoint = PROVIDERS["kimi-coding"]?.refreshUrl || PROVIDERS["kimi-coding"]?.tokenUrl;
  if (!endpoint) {
    log?.warn?.("TOKEN_REFRESH", "No refresh URL configured for Kimi Coding");
    return null;
  }

  // Generate device info for headers (same as OAuth flow)
  const deviceId = "kimi-refresh-" + Date.now();
  const platform = "routiform";
  const version = "2.1.2";
  const deviceModel =
    typeof process !== "undefined" ? `${process.platform} ${process.arch}` : "unknown";

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: PROVIDERS["kimi-coding"]?.clientId || "",
  });

  return dispatchTokenRequest({
    endpoint,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "X-Msh-Platform": platform,
      "X-Msh-Version": version,
      "X-Msh-Device-Model": deviceModel,
      "X-Msh-Device-Id": deviceId,
    },
    body: params,
    label: "Kimi Coding token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken, (tokens) => ({
      tokenType: tokens.token_type,
      scope: tokens.scope,
    })),
  });
}

/**
 * Specialized refresh for Claude OAuth tokens
 */
export async function refreshClaudeOAuthToken(refreshToken, log, proxyConfig = null) {
  // Standard OAuth2 token refresh uses form-urlencoded (not JSON)
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: PROVIDERS.claude.clientId,
  });

  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.anthropic.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
    body: params.toString(),
    label: "Claude OAuth token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

/**
 * Specialized refresh for Codex (OpenAI) OAuth tokens.
 * OpenAI uses rotating (one-time-use) refresh tokens.
 * Returns { error: 'refresh_token_reused' } when the token has already been consumed,
 * so callers can stop retrying and request re-authentication.
 */
export async function refreshCodexToken(refreshToken, log, proxyConfig = null) {
  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.openai.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: PROVIDERS.codex.clientId,
      scope: "openid profile email offline_access",
    }),
    label: "Codex token",
    log,
    proxyConfig,
    mapErrorBody: (errorText, status) => {
      // Detect unrecoverable "refresh_token_reused" error from OpenAI.
      // This means the token was already consumed and a new one was issued.
      // Retrying with the same token will never succeed.
      let errorCode = null;
      try {
        const parsed = JSON.parse(errorText);
        errorCode = parsed?.error?.code;
      } catch {
        // not JSON, ignore
      }

      if (errorCode === "refresh_token_reused") {
        log?.error?.(
          "TOKEN_REFRESH",
          "Codex refresh token already used (rotating token consumed). Re-authentication required.",
          {
            status,
          }
        );
        return { error: "refresh_token_reused" };
      }

      return null;
    },
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}
