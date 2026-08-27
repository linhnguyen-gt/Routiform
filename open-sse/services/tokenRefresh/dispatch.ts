import { runWithProxyContext } from "../../utils/proxyFetch.ts";

// Hard deadline for every provider OAuth HTTP request. Deliberately LONGER than
// REFRESH_TIMEOUT_MS (the caller-facing 30s race in refreshWithRetry): the gap between the
// caller giving up and the socket being torn down is what lets a late-arriving rotating-token
// response be captured by lateRefreshResults instead of being destroyed mid-flight by an
// abort. Without any deadline a stalled IdP held each request for undici's default ~300s,
// hanging the proactive paths (executors/default.ts, executors/codex.ts, getAllAccessTokens).
const OAUTH_FETCH_TIMEOUT_MS = 60_000;

/**
 * Single dispatcher for every provider token-refresh HTTP call.
 *
 * Owns the parts that used to be copy-pasted across ten refresh functions: proxy-aware
 * fetch with a hard abort deadline, non-ok handling (with optional provider-specific body
 * inspection), JSON parsing, success/error logging, and network-error containment.
 *
 * `mapResponse` maps the parsed JSON payload to the provider's result shape plus the details
 * for the success INFO log; returning null fails the refresh (the mapper logs its own
 * warnings, e.g. Cline's success:false check). `mapErrorBody`, when given, inspects a non-ok
 * response body and may return a non-null override — this is how Codex detects
 * refresh_token_reused.
 */
export async function dispatchTokenRequest({
  endpoint,
  method = "POST",
  headers,
  body = undefined,
  label,
  log,
  proxyConfig,
  mapResponse,
  mapErrorBody = null,
}) {
  try {
    const response = await runWithProxyContext(proxyConfig, () =>
      fetch(endpoint, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();

      if (mapErrorBody) {
        const overridden = mapErrorBody(errorText, response.status);
        if (overridden !== null && overridden !== undefined) return overridden;
      }

      log?.error?.("TOKEN_REFRESH", `Failed to refresh ${label}`, {
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    const mapped = mapResponse(data);
    if (!mapped) return null;

    log?.info?.("TOKEN_REFRESH", `Successfully refreshed ${label}`, mapped.info);
    return mapped.result;
  } catch (error) {
    log?.error?.("TOKEN_REFRESH", `Network error refreshing ${label}: ${error.message}`);
    return null;
  }
}

/** snake_case payload (standard OAuth2) → result, with optional extra passthrough fields. */
export function mapSnakeCaseTokens(refreshToken, buildExtra = null) {
  return (tokens) => ({
    result: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      expiresIn: tokens.expires_in,
      ...(buildExtra ? buildExtra(tokens) : null),
    },
    info: {
      hasNewAccessToken: !!tokens.access_token,
      hasNewRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    },
  });
}

export function mapCamelCaseTokens(refreshToken) {
  return (tokens) => ({
    result: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || refreshToken,
      expiresIn: tokens.expiresIn,
    },
    info: {
      hasNewAccessToken: !!tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
  });
}
