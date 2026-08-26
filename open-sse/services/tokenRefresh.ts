import { PROVIDERS, OAUTH_ENDPOINTS } from "../config/constants.ts";
import { pbkdf2Sync } from "node:crypto";
import { runWithProxyContext } from "../utils/proxyFetch.ts";

// Token expiry buffer (refresh if expires within 5 minutes)
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
export const REFRESH_LEAD_MS = {
  claude: 4 * 60 * 60 * 1000,
};

const CACHE_SECRET = "routiform-token-cache";

// ─── Late-arriving refresh results (rotating-token safety) ──────────────────
// Key: "provider:sha256(refreshToken)" → Value: Promise<result>
const refreshPromiseCache = new Map();

// Hard deadline for every provider OAuth HTTP request. Deliberately LONGER than
// REFRESH_TIMEOUT_MS (the caller-facing 30s race in refreshWithRetry): the gap between the
// caller giving up and the socket being torn down is what lets a late-arriving rotating-token
// response be captured by lateRefreshResults instead of being destroyed mid-flight by an
// abort. Without any deadline a stalled IdP held each request for undici's default ~300s,
// hanging the proactive paths (executors/default.ts, executors/codex.ts, getAllAccessTokens).
const OAUTH_FETCH_TIMEOUT_MS = 60_000;

// How long a refresh result that settled after its caller stopped waiting stays retrievable.
const LATE_RESULT_TTL_MS = 10 * 60 * 1000;

// Refresh results that settled AFTER the caller's timeout expired. Keyed exactly like
// refreshPromiseCache (provider + hash of the OLD refresh token). For rotating providers
// (Codex) the IdP has usually already consumed the single-use refresh token by the time the
// response lands — discarding that response permanently loses the NEW refresh token and
// forces manual re-auth. Parked results are served by getAccessToken through its normal
// return path, so whoever asks next persists them like any freshly refreshed credential.
const lateRefreshResults = new Map();

function parkLateRefreshResult(cacheKey, result) {
  const now = Date.now();
  for (const [key, entry] of lateRefreshResults) {
    if (entry.settledAt + LATE_RESULT_TTL_MS <= now) lateRefreshResults.delete(key);
  }
  lateRefreshResults.set(cacheKey, { result, settledAt: now });
}

function peekLateRefreshResult(cacheKey) {
  const entry = lateRefreshResults.get(cacheKey);
  if (!entry) return null;
  if (entry.settledAt + LATE_RESULT_TTL_MS <= Date.now()) {
    lateRefreshResults.delete(cacheKey);
    return null;
  }
  return entry.result;
}

function getRefreshCacheKey(provider, refreshToken) {
  const tokenHash = pbkdf2Sync(refreshToken, CACHE_SECRET, 1000, 32, "sha256").toString("hex");
  return `${provider}:${tokenHash}`;
}

export function getRefreshLeadMs(provider) {
  return REFRESH_LEAD_MS[provider] || TOKEN_EXPIRY_BUFFER_MS;
}

// ─── Shared refresh dispatcher ───────────────────────────────────────────────

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
async function dispatchTokenRequest({
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
function mapSnakeCaseTokens(refreshToken, buildExtra = null) {
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

function mapCamelCaseTokens(refreshToken) {
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

/**
 * Refresh OAuth access token using refresh token
 */
export async function refreshAccessToken(
  provider,
  refreshToken,
  credentials,
  log,
  proxyConfig = null
) {
  void credentials; // kept for signature stability; the endpoint config carries the client pair
  const config = PROVIDERS[provider];

  const refreshEndpoint = config?.refreshUrl || config?.tokenUrl;
  if (!config || !refreshEndpoint) {
    log?.warn?.("TOKEN_REFRESH", `No refresh endpoint configured for provider: ${provider}`);
    return null;
  }

  if (!refreshToken) {
    log?.warn?.("TOKEN_REFRESH", `No refresh token available for provider: ${provider}`);
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (config.clientId) params.set("client_id", config.clientId);
  if (config.clientSecret) params.set("client_secret", config.clientSecret);

  return dispatchTokenRequest({
    endpoint: refreshEndpoint,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
    label: `token for ${provider}`,
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

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
 * Specialized refresh for Google providers (Gemini, Antigravity)
 */
export async function refreshGoogleToken(
  refreshToken,
  clientId,
  clientSecret,
  log,
  proxyConfig = null
) {
  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.google.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    label: "Google token",
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

/**
 * Specialized refresh for Kiro (AWS CodeWhisperer) tokens
 * Supports both AWS SSO OIDC (Builder ID/IDC) and Social Auth (Google/GitHub)
 */
export async function refreshKiroToken(
  refreshToken,
  providerSpecificData,
  log,
  proxyConfig = null
) {
  const authMethod = providerSpecificData?.authMethod;
  const clientId = providerSpecificData?.clientId;
  const clientSecret = providerSpecificData?.clientSecret;
  const region = providerSpecificData?.region;

  // AWS SSO OIDC (Builder ID or IDC)
  // If clientId and clientSecret exist, assume AWS SSO OIDC (default to builder-id if authMethod not specified)
  if (clientId && clientSecret) {
    const isIDC = authMethod === "idc";
    const endpoint =
      isIDC && region
        ? `https://oidc.${region}.amazonaws.com/token`
        : "https://oidc.us-east-1.amazonaws.com/token";

    return dispatchTokenRequest({
      endpoint,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
        grantType: "refresh_token",
      }),
      label: "Kiro AWS token",
      log,
      proxyConfig,
      mapResponse: mapCamelCaseTokens(refreshToken),
    });
  }

  // Social Auth (Google/GitHub) - use Kiro's refresh endpoint
  return dispatchTokenRequest({
    endpoint: PROVIDERS.kiro.tokenUrl,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
    label: "Kiro social token",
    log,
    proxyConfig,
    mapResponse: mapCamelCaseTokens(refreshToken),
  });
}

/**
 * Specialized refresh for Qoder OAuth tokens
 */
export async function refreshIflowToken(refreshToken, log, proxyConfig = null) {
  if (!OAUTH_ENDPOINTS.qoder.token || !PROVIDERS.qoder.clientId || !PROVIDERS.qoder.clientSecret) {
    log?.warn?.(
      "TOKEN_REFRESH",
      "Qoder OAuth refresh skipped: browser OAuth is not configured in this environment"
    );
    return null;
  }

  const basicAuth = btoa(`${PROVIDERS.qoder.clientId}:${PROVIDERS.qoder.clientSecret}`);

  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.qoder.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: PROVIDERS.qoder.clientId,
      client_secret: PROVIDERS.qoder.clientSecret,
    }),
    label: "Qoder token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

/**
 * Specialized refresh for GitHub Copilot OAuth tokens
 */
export async function refreshGitHubToken(refreshToken, log, proxyConfig = null) {
  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.github.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: PROVIDERS.github.clientId,
      client_secret: PROVIDERS.github.clientSecret,
    }),
    label: "GitHub token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

/**
 * Refresh GitHub Copilot token using GitHub access token
 */
export async function refreshCopilotToken(githubAccessToken, log, proxyConfig = null) {
  return dispatchTokenRequest({
    endpoint: "https://api.github.com/copilot_internal/v2/token",
    method: "GET",
    headers: {
      Authorization: `token ${githubAccessToken}`,
      "User-Agent": "GithubCopilot/1.0",
      "Editor-Version": "vscode/1.100.0",
      "Editor-Plugin-Version": "copilot/1.300.0",
      Accept: "application/json",
    },
    label: "Copilot token",
    log,
    proxyConfig,
    mapResponse: (data) => ({
      result: {
        token: data.token,
        expiresAt: data.expires_at,
      },
      info: {
        hasToken: !!data.token,
        expiresAt: data.expires_at,
      },
    }),
  });
}

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

/**
 * Format credentials for provider
 */
export function formatProviderCredentials(provider, credentials, log) {
  const config = PROVIDERS[provider];
  if (!config) {
    log?.warn?.("TOKEN_REFRESH", `No configuration found for provider: ${provider}`);
    return null;
  }

  switch (provider) {
    case "gemini":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
        projectId: credentials.projectId,
      };

    case "claude":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
      };

    case "codex":
    case "qoder":
    case "openai":
    case "openrouter":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
      };

    case "antigravity":
      return {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
      };

    default:
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
      };
  }
}

/**
 * Get all access tokens for a user
 */
export async function getAllAccessTokens(userInfo, log) {
  const results = {};

  if (userInfo.connections && Array.isArray(userInfo.connections)) {
    for (const connection of userInfo.connections) {
      if (connection.isActive && connection.provider) {
        const token = await getAccessToken(
          connection.provider,
          {
            refreshToken: connection.refreshToken,
          },
          log
        );

        if (token) {
          results[connection.provider] = token;
        }
      }
    }
  }

  return results;
}

/**
 * Refresh token with retry and exponential backoff
 * Retries on failure with increasing delay: 1s, 2s, 3s...
 *
 * Includes:
 * - Per-connection circuit breaker (5 consecutive failures → 30min pause)
 * - 30s timeout per refresh attempt to prevent hanging connections
 *
 * @param {function} refreshFn - Async function that returns token or null
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @param {object} log - Logger instance (optional)
 * @param {string} provider - Provider ID for circuit breaker tracking (optional)
 * @returns {Promise<object|null>} Token result or null if all retries fail
 */

// ─── Circuit Breaker State ──────────────────────────────────────────────────
// Keyed per CONNECTION, not per provider. A provider-wide key meant one revoked refresh token
// blocked every other account of that provider for the full cooldown — an operator running four
// Claude connections lost all four because one died.
const _circuitBreaker: Record<string, { failures: number; blockedUntil: number }> = {};
const CIRCUIT_BREAKER_THRESHOLD = 5; // consecutive failures before tripping
const CIRCUIT_BREAKER_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const REFRESH_TIMEOUT_MS = 30_000; // 30s max per refresh attempt

interface CircuitBreakerStatusEntry {
  failures: number;
  blocked: boolean;
  blockedUntil: string | null;
  remainingMs: number;
}

interface RefreshLoggerLike {
  error?: (scope: string, message: string) => void;
  warn?: (scope: string, message: string) => void;
}

/**
 * Breaker key for a connection.
 *
 * An absent connection id falls back to the provider-wide key rather than to no key at all: it
 * degrades to the old behaviour, which is safe, instead of letting a caller escape the breaker,
 * which is not.
 */
function getBreakerKey(provider: string, connectionId?: string | null): string {
  return connectionId ? `${provider}:${connectionId}` : provider;
}

/**
 * Check if a connection is circuit-breaker blocked.
 */
export function isProviderBlocked(provider: string, connectionId?: string | null): boolean {
  const key = getBreakerKey(provider, connectionId);
  const state = _circuitBreaker[key];
  if (!state) return false;
  if (state.blockedUntil > Date.now()) return true;

  // Cooldown expired — reset. Guarded on `blockedUntil > 0`, which is the difference between
  // "this connection served its 30 minutes" and "this connection has failed a few times and has
  // not tripped yet". The unguarded delete wiped the consecutive-failure counter on every check,
  // and since every refresh checks before it records, the count could never get past 1 — the
  // threshold of 5 was unreachable and the breaker could not trip at all.
  if (state.blockedUntil > 0) delete _circuitBreaker[key];
  return false;
}

/**
 * Get circuit breaker status for every tracked connection (for diagnostics).
 *
 * Keys are `provider:connectionId`, or a bare provider when the caller had no connection id.
 */
export function getCircuitBreakerStatus(): Record<string, CircuitBreakerStatusEntry> {
  const result: Record<string, CircuitBreakerStatusEntry> = {};
  for (const [key, state] of Object.entries(_circuitBreaker)) {
    result[key] = {
      failures: state.failures,
      blocked: state.blockedUntil > Date.now(),
      blockedUntil:
        state.blockedUntil > Date.now() ? new Date(state.blockedUntil).toISOString() : null,
      remainingMs: Math.max(0, state.blockedUntil - Date.now()),
    };
  }
  return result;
}

/**
 * Record a successful refresh — resets the circuit breaker for that connection only.
 */
function recordSuccess(provider: string, connectionId?: string | null) {
  const key = getBreakerKey(provider, connectionId);
  if (_circuitBreaker[key]) {
    delete _circuitBreaker[key];
  }
}

/**
 * Record a failed refresh — increments circuit breaker counter.
 */
function recordFailure(
  provider: string,
  log: RefreshLoggerLike | null = null,
  connectionId?: string | null
) {
  const key = getBreakerKey(provider, connectionId);
  if (!_circuitBreaker[key]) {
    _circuitBreaker[key] = { failures: 0, blockedUntil: 0 };
  }
  _circuitBreaker[key].failures++;

  if (_circuitBreaker[key].failures >= CIRCUIT_BREAKER_THRESHOLD) {
    _circuitBreaker[key].blockedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
    // `key` is provider + connection id. Neither is credential material.
    log?.error?.(
      "TOKEN_REFRESH",
      `🔴 Circuit breaker tripped for ${key}: ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures. ` +
        `Blocked for ${CIRCUIT_BREAKER_COOLDOWN / 60000}min. This connection needs re-authentication.`
    );
  }
}

/**
 * Execute a function with a timeout.
 *
 * The race deliberately does NOT cancel or abort fn(): for rotating providers (Codex) the IdP
 * has often already consumed the single-use refresh token by the time the caller's deadline
 * expires, and destroying the in-flight request would discard the response carrying the NEW
 * refresh token. The promise keeps running — its dedup cache entry survives until it settles,
 * so refreshWithRetry's next attempt shares the same request instead of re-posting the token —
 * and a successful outcome is parked by getAccessToken (lateRefreshResults) for the next caller
 * to pick up through the normal refresh path.
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  // The timer is cleared once the race settles. Left dangling it keeps its closure — and the
  // event loop — alive for the full 30 seconds after every refresh that already finished.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The chat path has TWO independent refresh entry points, with different semantics, and only one
 * of them reaches this function:
 *   - proactive:  src/sse/handlers/chat.ts:510 → src/sse/services/tokenRefresh.ts:150 →
 *                 getAccessToken. No retry, no circuit breaker.
 *   - reactive:   handlers/chat-core/chat-core-phase-upstream-oauth-retry.ts, on a 401/403.
 *                 3 retries, breaker-protected — this function.
 * Do not assume breaker coverage on the proactive path. Reconciling the two is a separate job.
 */
export async function refreshWithRetry(
  refreshFn,
  maxRetries = 3,
  log = null,
  provider = "unknown",
  connectionId: string | null = null
) {
  const breakerKey = getBreakerKey(provider, connectionId);

  // Circuit breaker check
  if (isProviderBlocked(provider, connectionId)) {
    log?.warn?.("TOKEN_REFRESH", `⚡ Circuit breaker active for ${breakerKey}, skipping refresh`);
    return null;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1000;
      log?.debug?.("TOKEN_REFRESH", `Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const result = await withTimeout(refreshFn, REFRESH_TIMEOUT_MS);
      if (result) {
        recordSuccess(provider, connectionId);
        return result;
      }
    } catch (error) {
      log?.warn?.("TOKEN_REFRESH", `Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
    }
  }

  // All retries exhausted — record failure for circuit breaker
  recordFailure(provider, log, connectionId);
  log?.error?.("TOKEN_REFRESH", `All ${maxRetries} retry attempts failed for ${breakerKey}`);
  return null;
}
