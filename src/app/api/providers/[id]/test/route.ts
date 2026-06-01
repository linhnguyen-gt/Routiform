import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import {
  getProviderConnectionById,
  updateProviderConnection,
  isCloudEnabled,
  resolveProxyForConnection,
} from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/lib/cloudSync";
import { validateProviderApiKey } from "@/lib/providers/validation";
import { buildComboTestRequestBody, isComboTestErrorLikeText } from "@/lib/combos/testHealth";
import { getCliRuntimeStatus } from "@/shared/services/cliRuntime";
// Use the shared open-sse token refresh with built-in dedup/race-condition cache
import { getAccessToken } from "@routiform/open-sse/services/tokenRefresh.ts";
import { saveCallLog } from "@/lib/usageDb";
import { logProxyEvent } from "@/lib/proxyLogger";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";

// OAuth provider test endpoints
const OAUTH_TEST_CONFIG = {
  claude: {
    // Claude doesn't have userinfo, we verify token exists and not expired
    checkExpiry: true,
    refreshable: true,
  },
  codex: {
    // Codex OAuth tokens are ChatGPT session tokens, NOT standard OpenAI API keys.
    // They don't work with api.openai.com/v1/models (returns 403 "Access denied").
    // Use checkExpiry mode instead — actual connectivity is validated via Usage/Limits.
    checkExpiry: true,
    refreshable: true,
  },
  "gemini-cli": {
    url: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    refreshable: true,
  },
  antigravity: {
    url: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    refreshable: true,
  },
  github: {
    url: "https://api.github.com/user",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    extraHeaders: { "User-Agent": "Routiform", Accept: "application/vnd.github+json" },
  },
  iflow: {
    // iFlow's getUserInfo endpoint returns 400 without a specific format.
    // Use checkExpiry instead — actual connectivity is validated via real requests.
    checkExpiry: true,
    refreshable: true,
  },
  cursor: {
    checkExpiry: true,
  },
  devin: {
    checkExpiry: true,
  },
  "kimi-coding": {
    checkExpiry: true,
    refreshable: true,
  },
  kilocode: {
    // Kilo OAuth does not expose a stable user-info endpoint in all environments.
    // Validate using token presence/expiry as a lightweight auth check.
    checkExpiry: true,
  },
  cline: {
    // Cline's /api/v1/models endpoint frequently returns stale auth errors even
    // with fresh tokens. Use checkExpiry instead — actual connectivity is validated
    // via real requests.
    checkExpiry: true,
    refreshable: true,
  },
  kiro: {
    checkExpiry: true,
    refreshable: true,
  },
  qoder: {
    checkExpiry: true,
    refreshable: true,
  },
};

const CLI_RUNTIME_PROVIDER_MAP = {
  cline: "cline",
  kilocode: "kilo",
  qoder: "qoder",
};

/** POST body is optional; when present, only known fields are validated. */
const providerConnectionTestBodySchema = z.object({
  validationModelId: z.string().max(500).optional(),
});

function toSafeMessage(value: unknown, fallback = "Unknown error"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function makeDiagnosis(
  type: string,
  source: string,
  message: string | null,
  code: string | null = null
) {
  return {
    type,
    source,
    message: message || null,
    code: code ?? null,
  };
}

function classifyFailure({
  error,
  statusCode = null,
  refreshFailed = false,
  unsupported = false,
}: {
  error: string;
  statusCode?: number | null;
  refreshFailed?: boolean;
  unsupported?: boolean;
}) {
  const message = toSafeMessage(error, "Connection test failed");
  const normalized = message.toLowerCase();
  const numericStatus = Number.isFinite(statusCode) ? Number(statusCode) : null;

  if (unsupported) {
    return makeDiagnosis("unsupported", "validation", message, "unsupported");
  }

  if (refreshFailed || normalized.includes("refresh failed")) {
    return makeDiagnosis("token_refresh_failed", "oauth", message, "refresh_failed");
  }

  // 403 with subscription/quota message → treat as quota issue, not auth error
  if (
    numericStatus === 403 &&
    (normalized.includes("subscription") ||
      normalized.includes("high volume") ||
      normalized.includes("requires a subscription") ||
      normalized.includes("upgrade for access") ||
      normalized.includes("capacity"))
  ) {
    return makeDiagnosis("upstream_rate_limited", "upstream", message, "403");
  }

  if (numericStatus === 401 || numericStatus === 403) {
    return makeDiagnosis("upstream_auth_error", "upstream", message, String(numericStatus));
  }

  if (numericStatus === 429) {
    return makeDiagnosis("upstream_rate_limited", "upstream", message, "429");
  }

  if (numericStatus && numericStatus >= 500) {
    return makeDiagnosis("upstream_unavailable", "upstream", message, String(numericStatus));
  }

  if (normalized.includes("token expired") || normalized.includes("expired")) {
    return makeDiagnosis("token_expired", "oauth", message, "token_expired");
  }

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("token invalid") ||
    normalized.includes("revoked") ||
    normalized.includes("access denied") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return makeDiagnosis(
      "upstream_auth_error",
      "upstream",
      message,
      numericStatus ? String(numericStatus) : "auth_failed"
    );
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("quota") ||
    normalized.includes("too many requests")
  ) {
    return makeDiagnosis(
      "upstream_rate_limited",
      "upstream",
      message,
      numericStatus ? String(numericStatus) : "rate_limited"
    );
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("econn") ||
    normalized.includes("enotfound") ||
    normalized.includes("socket")
  ) {
    return makeDiagnosis("network_error", "upstream", message, "network_error");
  }

  return makeDiagnosis(
    "upstream_error",
    "upstream",
    message,
    numericStatus ? String(numericStatus) : "upstream_error"
  );
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = (error.name || "").toLowerCase();
  const message = (error.message || "").toLowerCase();
  return (
    name === "aborterror" ||
    name === "timeouterror" ||
    message.includes("aborted due to timeout") ||
    message.includes("timeout")
  );
}

async function getProviderRuntimeStatus(connection: unknown) {
  const provider =
    connection &&
    typeof connection === "object" &&
    "provider" in connection &&
    typeof connection.provider === "string"
      ? connection.provider
      : "";
  let toolId = CLI_RUNTIME_PROVIDER_MAP[provider];
  if (
    provider === "qoder" &&
    connection &&
    typeof connection === "object" &&
    "authType" in connection &&
    connection.authType !== "apikey"
  ) {
    toolId = null;
  }
  if (!toolId) return null;

  try {
    const runtime = await getCliRuntimeStatus(toolId);
    if (runtime.installed && runtime.runnable) {
      return runtime;
    }

    const runtimeMessage = runtime.installed
      ? `Local CLI runtime is installed but not runnable (${runtime.reason || "healthcheck_failed"})`
      : "Local CLI runtime is not installed";

    return {
      ...runtime,
      diagnosis: makeDiagnosis(
        "runtime_error",
        "local",
        runtimeMessage,
        runtime.reason || "runtime_error"
      ),
      error: runtimeMessage,
    };
  } catch (error) {
    const runtimeMessage = `Failed to check local CLI runtime: ${(error as Record<string, unknown>)?.message || "runtime_check_failed"}`;
    return {
      installed: false,
      runnable: false,
      reason: "runtime_check_failed",
      diagnosis: makeDiagnosis("runtime_error", "local", runtimeMessage, "runtime_check_failed"),
      error: runtimeMessage,
    };
  }
}

/**
 * Refresh OAuth token using the shared open-sse getAccessToken.
 * This shares the in-flight promise cache with the SSE layer,
 * preventing race conditions where two code paths attempt to
 * refresh the same token concurrently.
 *
 * @returns {object} { accessToken, expiresIn, refreshToken } or null if failed
 */
async function refreshOAuthToken(connection: unknown) {
  if (!connection || typeof connection !== "object") return null;

  const provider =
    "provider" in connection && typeof connection.provider === "string" ? connection.provider : "";
  const refreshToken =
    "refreshToken" in connection && typeof connection.refreshToken === "string"
      ? connection.refreshToken
      : "";

  if (!refreshToken) return null;

  try {
    // Kiro needs extra fields the generic function expects
    const connectionObj = connection as Record<string, unknown>;
    const credentials = {
      refreshToken,
      providerSpecificData: (connectionObj.providerSpecificData as Record<string, unknown>) || {},
    };

    const result = await getAccessToken(provider, credentials, console);
    return result; // { accessToken, expiresIn, refreshToken } or null
  } catch (err) {
    console.log(`Error refreshing ${provider} token:`, (err as Error).message);
    return null;
  }
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(connection: unknown) {
  if (!connection || typeof connection !== "object") return false;

  const expiresAtValue =
    ("expiresAt" in connection ? connection.expiresAt : null) ||
    ("tokenExpiresAt" in connection ? connection.tokenExpiresAt : null);
  if (!expiresAtValue) return false;
  const expiresAt = new Date(expiresAtValue as string | number | Date).getTime();
  const buffer = 5 * 60 * 1000; // 5 minutes
  return expiresAt <= Date.now() + buffer;
}

/**
 * Sync to cloud if enabled
 */
async function syncToCloudIfEnabled() {
  try {
    const cloudEnabled = await isCloudEnabled();
    if (!cloudEnabled) return;

    const machineId = await getConsistentMachineId();
    await syncToCloud(machineId);
  } catch (error) {
    console.log("Error syncing to cloud after token refresh:", error);
  }
}

/**
 * Test OAuth connection by calling provider API
 * Auto-refreshes token if expired
 * @returns {{ valid: boolean, error: string|null, refreshed: boolean, newTokens: object|null }}
 */
async function testOAuthConnection(connection: unknown) {
  const connectionObj = connection as Record<string, unknown>;
  const config = OAUTH_TEST_CONFIG[connectionObj.provider as string];

  if (!config) {
    const error = "Provider test not supported";
    return {
      valid: false,
      error,
      refreshed: false,
      diagnosis: classifyFailure({ error, unsupported: true }),
    };
  }

  // Check if token exists
  if (!connectionObj.accessToken) {
    // If the refresh token is also missing on a refreshable provider,
    // this means re-authentication is needed (e.g. after refresh_token_reused)
    if (config.refreshable && !connectionObj.refreshToken) {
      const error = "Refresh token expired. Please re-authenticate this account.";
      return {
        valid: false,
        error,
        refreshed: false,
        diagnosis: makeDiagnosis("reauth_required", "oauth", error, "reauth_required"),
      };
    }
    const error = "No access token";
    return {
      valid: false,
      error,
      refreshed: false,
      diagnosis: makeDiagnosis("auth_missing", "local", error, "missing_access_token"),
    };
  }

  let accessToken = connectionObj.accessToken as string;
  let refreshed = false;
  let newTokens = null;

  // Auto-refresh if token is expired and provider supports refresh
  const tokenExpired = isTokenExpired(connection);
  if (config.refreshable && tokenExpired && connectionObj.refreshToken) {
    const tokens = await refreshOAuthToken(connection);
    if (tokens) {
      accessToken = tokens.accessToken;
      refreshed = true;
      newTokens = tokens;
    } else {
      // Refresh failed
      const error = "Token expired and refresh failed";
      return {
        valid: false,
        error,
        refreshed: false,
        diagnosis: classifyFailure({ error, refreshFailed: true }),
      };
    }
  }

  // For providers that only check expiry (no test endpoint available)
  if (config.checkExpiry) {
    const testStatus =
      typeof connectionObj.testStatus === "string" ? connectionObj.testStatus.toLowerCase() : "";
    const lastErrorType =
      typeof connectionObj.lastErrorType === "string"
        ? connectionObj.lastErrorType.toLowerCase()
        : "";
    const lastError = typeof connectionObj.lastError === "string" ? connectionObj.lastError : "";
    const lastErrorAt =
      typeof connectionObj.lastErrorAt === "string" ? Date.parse(connectionObj.lastErrorAt) : NaN;
    const isRecentFailure =
      Number.isFinite(lastErrorAt) && Date.now() - lastErrorAt <= 6 * 60 * 60 * 1000;
    const hasBlockingStatus =
      testStatus === "banned" ||
      testStatus === "credits_exhausted" ||
      testStatus === "unavailable" ||
      testStatus === "error";
    const hasBlockingErrorType =
      lastErrorType === "quota_exhausted" ||
      lastErrorType === "forbidden" ||
      lastErrorType === "upstream_auth_error" ||
      lastErrorType === "upstream_rate_limited" ||
      lastErrorType === "upstream_unavailable";

    // If we already refreshed successfully, token is valid
    if (refreshed) {
      return {
        valid: true,
        error: null,
        refreshed,
        newTokens,
        diagnosis: makeDiagnosis("ok", "oauth", null, null),
      };
    }
    // Check if token is expired (no refresh available)
    if (tokenExpired) {
      const error = "Token expired";
      return {
        valid: false,
        error,
        refreshed: false,
        diagnosis: classifyFailure({ error }),
      };
    }

    // Preserve recent upstream failure signals for check-expiry providers.
    // Without this, providers that only support token-expiry checks can report
    // healthy even when recent real requests failed with quota/402 errors.
    if ((hasBlockingStatus || hasBlockingErrorType) && isRecentFailure) {
      const error =
        lastError ||
        (hasBlockingErrorType
          ? `Recent upstream failure (${lastErrorType})`
          : "Recent upstream failure");
      return {
        valid: false,
        error,
        refreshed: false,
        diagnosis: classifyFailure({ error }),
      };
    }

    return {
      valid: true,
      error: null,
      refreshed: false,
      newTokens: null,
      diagnosis: makeDiagnosis("ok", "local", null, null),
    };
  }

  // Call test endpoint
  try {
    const headers = {
      [config.authHeader]: `${config.authPrefix}${accessToken}`,
      ...config.extraHeaders,
    };

    const res = await fetch(config.url, {
      method: config.method,
      headers,
    });

    if (res.ok) {
      return {
        valid: true,
        error: null,
        refreshed,
        newTokens,
        diagnosis: makeDiagnosis("ok", "upstream", null, null),
      };
    }

    // If 401/403 and we haven't tried refresh yet, only attempt refresh
    // if the token is actually expired. This prevents corrupting valid tokens
    // when the upstream returns transient 401/403 errors (rate-limiting, etc.).
    if (
      (res.status === 401 || res.status === 403) &&
      !refreshed &&
      isTokenExpired(connection) &&
      connectionObj.refreshToken &&
      typeof connectionObj.refreshToken === "string"
    ) {
      const tokens = await refreshOAuthToken(connection);
      if (tokens) {
        // Retry with new token
        const retryRes = await fetch(config.url, {
          method: config.method,
          headers: {
            [config.authHeader]: `${config.authPrefix}${tokens.accessToken}`,
            ...config.extraHeaders,
          },
        });

        if (retryRes.ok) {
          return {
            valid: true,
            error: null,
            refreshed: true,
            newTokens: tokens,
            diagnosis: makeDiagnosis("ok", "upstream", null, null),
          };
        }

        const error = `API returned ${retryRes.status} after token refresh`;
        return {
          valid: false,
          error,
          refreshed: true,
          statusCode: retryRes.status,
          diagnosis: classifyFailure({ error, statusCode: retryRes.status }),
        };
      }
      const error = "Token expired and refresh failed";
      return {
        valid: false,
        error,
        refreshed: false,
        statusCode: 401,
        diagnosis: classifyFailure({ error, statusCode: 401, refreshFailed: true }),
      };
    }

    const error =
      res.status === 401
        ? "Token invalid or revoked"
        : res.status === 403
          ? "Access denied"
          : `API returned ${res.status}`;

    return {
      valid: false,
      error,
      refreshed,
      statusCode: res.status,
      diagnosis: classifyFailure({ error, statusCode: res.status }),
    };
  } catch (err) {
    const errObj = err as { message?: string };
    const error = toSafeMessage(errObj?.message, "Connection test failed");
    return {
      valid: false,
      error,
      refreshed,
      diagnosis: classifyFailure({ error }),
    };
  }
}

async function runOAuthModelProbe(
  connection: Record<string, unknown>,
  validationModelId?: string
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const provider =
    typeof connection.provider === "string"
      ? connection.provider
      : String(connection.provider || "");
  const model =
    typeof validationModelId === "string" && validationModelId.trim().length > 0
      ? validationModelId.trim()
      : "";
  if (!provider || !model) return { ok: true };

  const accessToken =
    typeof connection.accessToken === "string" && connection.accessToken.trim().length > 0
      ? connection.accessToken
      : null;
  if (!accessToken) {
    return { ok: false, error: "Missing OAuth access token", statusCode: 401 };
  }

  const body = buildComboTestRequestBody(`${provider}/${model}`);
  const req = new Request("http://localhost/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Routiform-No-Cache": "true",
      "X-Internal-Test": "combo-health-check",
    },
    body: JSON.stringify(body),
  });

  try {
    const { handleChat } = await import("@/sse/handlers/chat");
    const response = await handleChat(req);
    const statusCode = response.status;
    const raw = await response.text().catch(() => "");

    if (!response.ok) {
      return {
        ok: false,
        error: raw || `Model probe failed (${statusCode})`,
        statusCode,
      };
    }

    if (!raw.trim()) {
      return {
        ok: false,
        error: "Model probe returned empty response",
        statusCode,
      };
    }

    if (isComboTestErrorLikeText(raw)) {
      return {
        ok: false,
        error: raw.slice(0, 240),
        statusCode,
      };
    }

    return { ok: true, statusCode };
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      return {
        ok: false,
        error: "Model probe timeout (15s)",
        statusCode: 504,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Model probe failed",
      statusCode: 500,
    };
  }
}

/**
 * Test API key connection
 */
async function testApiKeyConnection(connection: unknown) {
  const connectionObj = connection as Record<string, unknown>;
  if (!connectionObj.apiKey) {
    const error = "Missing API key";
    return {
      valid: false,
      error,
      diagnosis: makeDiagnosis("auth_missing", "local", error, "missing_api_key"),
    };
  }

  const result = await validateProviderApiKey({
    provider: connectionObj.provider as string,
    apiKey: connectionObj.apiKey as string,
    providerSpecificData: connectionObj.providerSpecificData as Record<string, unknown>,
  });

  if ("unsupported" in result && result.unsupported) {
    const error = "Provider test not supported";
    return {
      valid: false,
      error,
      diagnosis: classifyFailure({ error, unsupported: true }),
    };
  }

  const error = result.valid ? null : result.error || "Invalid API key";
  const diagnosis = result.valid
    ? makeDiagnosis("ok", "upstream", null, null)
    : classifyFailure({ error });

  return {
    valid: !!result.valid,
    error,
    warning: ("warning" in result ? result.warning : null) || null,
    diagnosis,
  };
}

/**
 * Core test logic — reusable by test-batch without HTTP self-calls.
 * @param {string} connectionId
 * @param {string} validationModelId Optional custom model ID to test connection with
 * @returns {Promise<object>} Test result (same shape as the JSON response)
 */
export async function testSingleConnection(connectionId: string, validationModelId?: string) {
  const connection = await getProviderConnectionById(connectionId);

  if (!connection) {
    return { valid: false, error: "Connection not found", diagnosis: null, latencyMs: 0 };
  }

  const provider = typeof connection.provider === "string" ? connection.provider : "";
  if (!provider) {
    return {
      valid: false,
      error: "Connection provider is invalid",
      diagnosis: makeDiagnosis(
        "validation_error",
        "local",
        "Connection provider is invalid",
        "provider_invalid"
      ),
      latencyMs: 0,
    };
  }

  // Resolve proxy for this connection (key → combo → provider → global → direct)
  let proxyInfo: Record<string, unknown> | null = null;
  try {
    proxyInfo = await resolveProxyForConnection(connectionId);
  } catch (proxyErr: unknown) {
    console.log(
      `[ConnectionTest] Failed to resolve proxy for ${connectionId}:`,
      (proxyErr as Error)?.message
    );
  }

  let result;
  const startTime = Date.now();
  const runtime = await getProviderRuntimeStatus(connection);

  if ((runtime as Record<string, unknown>)?.diagnosis) {
    result = {
      valid: false,
      error: (runtime as Record<string, unknown>).error,
      refreshed: false,
      diagnosis: (runtime as Record<string, unknown>).diagnosis,
    };
  } else if (connection.authType === "apikey") {
    const enrichedConnection = validationModelId
      ? {
          ...connection,
          providerSpecificData: {
            ...((connection.providerSpecificData as Record<string, unknown>) || {}),
            validationModelId,
          },
        }
      : connection;
    result = await runWithProxyContext(proxyInfo?.proxy || null, () =>
      testApiKeyConnection(enrichedConnection)
    );
  } else {
    result = await runWithProxyContext((proxyInfo?.proxy as string) || null, () =>
      testOAuthConnection(connection)
    );

    if (
      result.valid &&
      typeof validationModelId === "string" &&
      validationModelId.trim().length > 0
    ) {
      const probe = await runOAuthModelProbe(
        connection as Record<string, unknown>,
        validationModelId
      );
      if (!probe.ok) {
        result = {
          valid: false,
          error: probe.error || "Model validation probe failed",
          refreshed: Boolean(result.refreshed),
          statusCode: probe.statusCode || null,
          diagnosis: classifyFailure({
            error: probe.error || "Model validation probe failed",
            statusCode: probe.statusCode || undefined,
          }),
        };
      }
    }
  }

  const latencyMs = Date.now() - startTime;

  // Build update data
  const now = new Date().toISOString();
  const diagnosis =
    result.diagnosis ||
    (result.valid
      ? makeDiagnosis("ok", "local", null, null)
      : classifyFailure({ error: result.error, statusCode: result.statusCode }));

  const updateData: Record<string, unknown> = {
    testStatus: result.valid ? "active" : "error",
    lastError: result.valid ? null : result.error,
    lastErrorAt: result.valid ? null : now,
    lastTested: now,
    lastErrorType: result.valid ? null : diagnosis.type,
    lastErrorSource: result.valid ? null : diagnosis.source,
    errorCode: result.valid ? null : diagnosis.code || result.statusCode || null,
    rateLimitedUntil: result.valid ? null : connection.rateLimitedUntil || null,
  };

  if (result.valid) {
    updateData.backoffLevel = 0;
  }

  // If token was refreshed, update tokens in DB
  if (result.refreshed && result.newTokens) {
    updateData.accessToken = result.newTokens.accessToken;
    if (result.newTokens.refreshToken) {
      updateData.refreshToken = result.newTokens.refreshToken;
    }
    if (result.newTokens.expiresIn) {
      updateData.expiresAt = new Date(Date.now() + result.newTokens.expiresIn * 1000).toISOString();
    }
  }

  // Update status in db
  await updateProviderConnection(connectionId, updateData);

  // Sync to cloud if token was refreshed
  if (result.refreshed) {
    await syncToCloudIfEnabled();
  }

  // Log to Logger tab (call_logs table)
  try {
    saveCallLog({
      method: "POST",
      path: "/api/providers/test",
      status: result.valid ? 200 : result.statusCode || 401,
      model: validationModelId || "connection-test",
      provider,
      connectionId,
      duration: latencyMs,
      error: result.valid ? null : result.error || null,
      sourceFormat: "test",
      targetFormat: "test",
      requestType: "connection-test",
    }).catch(() => {});
  } catch {}

  // Log to Proxy tab (proxy_logs table)
  try {
    const proxyType =
      proxyInfo &&
      typeof proxyInfo === "object" &&
      "type" in proxyInfo &&
      typeof proxyInfo.type === "string"
        ? proxyInfo.type
        : "";
    const proxyHost =
      proxyInfo &&
      typeof proxyInfo === "object" &&
      "host" in proxyInfo &&
      typeof proxyInfo.host === "string"
        ? proxyInfo.host
        : "";
    const proxyPort =
      proxyInfo &&
      typeof proxyInfo === "object" &&
      "port" in proxyInfo &&
      typeof proxyInfo.port === "string"
        ? proxyInfo.port
        : "";

    logProxyEvent({
      status: result.valid ? "success" : "error",
      proxy:
        proxyType && proxyHost && proxyPort
          ? { type: proxyType, host: proxyHost, port: proxyPort }
          : null,
      level:
        proxyInfo &&
        typeof proxyInfo === "object" &&
        "level" in proxyInfo &&
        typeof proxyInfo.level === "string"
          ? proxyInfo.level
          : "provider-test",
      levelId:
        proxyInfo &&
        typeof proxyInfo === "object" &&
        "levelId" in proxyInfo &&
        typeof proxyInfo.levelId === "string"
          ? proxyInfo.levelId
          : null,
      provider,
      targetUrl: `${provider}/connection-test`,
      latencyMs,
      error: result.valid ? null : result.error || null,
      connectionId,
      comboId: null,
      account: connectionId?.slice(0, 8) || null,
      tlsFingerprint: false,
    });
  } catch {}

  return {
    valid: result.valid,
    error: result.error,
    warning: result.warning || null,
    refreshed: result.refreshed || false,
    diagnosis,
    latencyMs,
    statusCode: result.statusCode || null,
    runtime: runtime || null,
    testedAt: now,
  };
}

// POST /api/providers/[id]/test - Test connection
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      // Empty or non-JSON body — treat as {}
    }
    const validation = validateBody(providerConnectionTestBodySchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { validationModelId } = validation.data;

    const data = await testSingleConnection(id, validationModelId);

    if (data.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
