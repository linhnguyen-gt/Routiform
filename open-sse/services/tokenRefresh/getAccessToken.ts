import { PROVIDERS } from "../../config/constants.ts";
import {
  refreshGoogleToken,
  refreshClaudeOAuthToken,
  refreshCodexToken,
  refreshIflowToken,
  refreshGitHubToken,
  refreshKiroToken,
  refreshClineToken,
  refreshKimiCodingToken,
  refreshAccessToken,
} from "./providers/index.ts";
import {
  refreshPromiseCache,
  getRefreshCacheKey,
  parkLateRefreshResult,
  peekLateRefreshResult,
} from "./lateResults.ts";

/**
 * Get access token for a specific provider (internal, does the actual work)
 */
async function _getAccessTokenInternal(provider, credentials, log, proxyConfig = null) {
  // Antigravity is the only Google-OAuth provider; the API-key `gemini` provider that
  // used to sit beside it was removed, and it never carried a refresh token anyway.
  switch (provider) {
    case "antigravity":
      return await refreshGoogleToken(
        credentials.refreshToken,
        PROVIDERS[provider].clientId,
        PROVIDERS[provider].clientSecret,
        log,
        proxyConfig
      );

    case "claude":
      return await refreshClaudeOAuthToken(credentials.refreshToken, log, proxyConfig);

    case "codex":
      return await refreshCodexToken(credentials.refreshToken, log, proxyConfig);

    case "qoder":
      return await refreshIflowToken(credentials.refreshToken, log, proxyConfig);

    case "github":
      return await refreshGitHubToken(credentials.refreshToken, log, proxyConfig);

    case "kiro":
      return await refreshKiroToken(
        credentials.refreshToken,
        credentials.providerSpecificData,
        log,
        proxyConfig
      );

    case "cline":
      return await refreshClineToken(credentials.refreshToken, log, proxyConfig);

    case "kimi-coding":
      return await refreshKimiCodingToken(credentials.refreshToken, log, proxyConfig);

    default:
      // Fallback to generic OAuth refresh for unknown providers
      return refreshAccessToken(provider, credentials.refreshToken, credentials, log, proxyConfig);
  }
}

/**
 * Whether a provider has a supported refresh path in this service.
 */
export function supportsTokenRefresh(provider) {
  const explicitlySupported = new Set([
    "antigravity",
    "claude",
    "codex",
    "qoder",
    "github",
    "kiro",
    "cline",
    "kimi-coding",
    "xai",
  ]);
  if (explicitlySupported.has(provider)) return true;
  const config = PROVIDERS[provider];
  return !!(config?.refreshUrl || config?.tokenUrl);
}

/**
 * Check if a refresh result indicates an unrecoverable error
 * (e.g. the refresh token was already consumed and cannot be reused).
 * Callers should stop retrying and request re-authentication.
 */
export function isUnrecoverableRefreshError(result) {
  return (
    result &&
    typeof result === "object" &&
    (result.error === "refresh_token_reused" || result.error === "invalid_request")
  );
}

/**
 * Get access token for a specific provider (with deduplication).
 * If a refresh is already in-flight for the same provider+token,
 * subsequent calls share the existing promise instead of making
 * parallel OAuth requests.
 *
 * Rotating-token safety: when a caller stops waiting on an in-flight refresh
 * (refreshWithRetry's 30s race resolves null), the underlying HTTP request keeps running —
 * aborting it could destroy a response that carries a freshly rotated refresh token the IdP
 * has already exchanged the old one for. Successful results are therefore parked in
 * lateRefreshResults, and any later call for the same stale token is served from there
 * through this normal return path instead of re-posting the burned token.
 */
export async function getAccessToken(provider, credentials, log, proxyConfig = null) {
  if (!credentials || !credentials.refreshToken || typeof credentials.refreshToken !== "string") {
    log?.warn?.("TOKEN_REFRESH", `No valid refresh token available for provider: ${provider}`);
    return null;
  }

  const cacheKey = getRefreshCacheKey(provider, credentials.refreshToken);

  // Serve a credential set that arrived after its original caller gave up (see
  // lateRefreshResults above) before considering a new refresh.
  const parked = peekLateRefreshResult(cacheKey);
  if (parked) {
    log?.info?.("TOKEN_REFRESH", `Serving late-arriving refresh result for ${provider}`);
    return parked;
  }

  // If a refresh is already in-flight, reuse it
  if (refreshPromiseCache.has(cacheKey)) {
    log?.info?.("TOKEN_REFRESH", `Reusing in-flight refresh for ${provider}`);
    return refreshPromiseCache.get(cacheKey);
  }

  // Start a new refresh and cache the promise. The .then parks successful results for the
  // late-arriving case; the .finally still clears the dedup entry as soon as the request
  // truly settles, whether or not anyone is still listening.
  const refreshPromise = _getAccessTokenInternal(provider, credentials, log, proxyConfig)
    .then((result) => {
      if (result && typeof result === "object" && result.accessToken) {
        parkLateRefreshResult(cacheKey, result);
      }
      return result;
    })
    .finally(() => {
      refreshPromiseCache.delete(cacheKey);
    });

  refreshPromiseCache.set(cacheKey, refreshPromise);
  return refreshPromise;
}

/**
 * Refresh token by provider type (alias for getAccessToken)
 * @deprecated Since v0.2.70 — use getAccessToken() directly.
 * Still exported because open-sse/index.js and src/sse wrapper use it.
 * Will be removed in a future major version.
 */
export const refreshTokenByProvider = getAccessToken;
