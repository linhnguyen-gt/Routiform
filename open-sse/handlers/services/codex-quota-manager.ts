import { getProviderConnectionById, updateProviderConnection } from "@/lib/db/providers";
import {
  getCodexModelScope,
  getCodexResetTime,
  parseCodexQuotaHeaders,
} from "../../executors/codex.ts";

/**
 * Codex quota management service
 * Extracted from chatCore.ts for better modularity
 */

/**
 * Persists Codex quota state from response headers to the database
 * @param options - Configuration options
 * @param options.provider - Provider name (must be "codex")
 * @param options.connectionId - Connection ID for the provider
 * @param options.credentials - Provider credentials object
 * @param options.model - Model name
 * @param options.requestedModel - Requested model name (fallback)
 * @param options.headers - Response headers containing quota information
 * @param options.status - HTTP status code (429 triggers rate limit tracking)
 * @param options.log - Logger instance
 */
export async function persistCodexQuotaState(options: {
  provider: string;
  connectionId?: string;
  credentials: { providerSpecificData?: Record<string, unknown> } | null;
  model?: string;
  requestedModel?: string;
  headers: Headers | Record<string, string> | null;
  status?: number;
  log?: {
    debug?: (category: string, message: string) => void;
  };
}) {
  const {
    provider,
    connectionId,
    credentials,
    model,
    requestedModel,
    headers,
    status = 0,
    log,
  } = options;

  if (provider !== "codex" || !connectionId || !headers) return;

  try {
    const quota = parseCodexQuotaHeaders(headers as Headers);
    if (!quota) return;

    // Build minimal update to avoid clobbering concurrent changes to other
    // providerSpecificData keys; let updateProviderConnection merge at DB level.
    const updatePayload: {
      providerSpecificData: Record<string, unknown>;
    } = {
      providerSpecificData: { codexQuotaState: quota },
    };

    // T03/T09: on 429, persist exact reset time per scope to avoid global over-blocking.
    if (status === 429) {
      const resetTimeMs = getCodexResetTime(quota);
      if (resetTimeMs && resetTimeMs > Date.now()) {
        // Fetch latest providerSpecificData to merge scope rate limit entries (or rely on DB merge)
        const connection = connectionId ? await getProviderConnectionById(connectionId) : null;
        const existingDbProviderData = connection?.providerSpecificData
          ? (connection.providerSpecificData as Record<string, unknown>)
          : {};

        const scopeKey = getCodexModelScope(model || requestedModel || "");
        const scopeUntil = new Date(resetTimeMs).toISOString();
        const existingScopeMap =
          existingDbProviderData.codexScopeRateLimitedUntil &&
          typeof existingDbProviderData.codexScopeRateLimitedUntil === "object"
            ? (existingDbProviderData.codexScopeRateLimitedUntil as Record<string, unknown>)
            : {};

        updatePayload.providerSpecificData.codexScopeRateLimitedUntil = {
          ...existingScopeMap,
          [scopeKey]: scopeUntil,
        };
      }
    }

    const updated = await updateProviderConnection(connectionId, updatePayload);

    if (credentials && updated) {
      credentials.providerSpecificData = updated.providerSpecificData as Record<string, unknown>;
    }
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    log?.debug?.("CODEX", `Failed to persist codex quota state: ${errMessage}`);
  }
}
