/**
 * Search handler — main orchestrator and per-provider execution.
 */
import { getSearchProvider, type SearchProviderConfig } from "../../config/searchRegistry.ts";
import { saveCallLog } from "@/lib/usageDb";

import type { SearchHandlerOptions, SearchHandlerResult } from "./types.ts";
import { GLOBAL_TIMEOUT_MS, NON_RETRIABLE, sanitizeQuery } from "./types.ts";
import {
  type SearchRequestParams as ProviderRequestParams,
  buildRequest,
  normalizeResponse,
} from "./providers/common.ts";

// ── Main Handler ────────────────────────────────────────────────────────

export async function handleSearch(options: SearchHandlerOptions): Promise<SearchHandlerResult> {
  const {
    query,
    provider: providerId,
    maxResults,
    searchType,
    country,
    language,
    domainFilter,
    credentials,
    alternateProvider,
    alternateCredentials,
    log,
  } = options;
  const startTime = Date.now();

  // 1. Sanitize input
  const { clean: cleanQuery, error: sanitizeError } = sanitizeQuery(query);
  if (sanitizeError) {
    return { success: false, status: 400, error: sanitizeError };
  }

  // 2. Use resolved provider from route (no re-resolution)
  const primaryConfig = getSearchProvider(providerId);
  if (!primaryConfig) {
    return {
      success: false,
      status: 400,
      error: `Unknown search provider: ${providerId}`,
    };
  }

  // 3. Get alternate config for failover (pre-resolved by route)
  const alternateConfig = alternateProvider ? getSearchProvider(alternateProvider) : null;

  const requestParams = {
    query: cleanQuery,
    searchType,
    maxResults,
    country,
    language,
    domainFilter,
  };

  // 4. Try primary provider
  const result = await tryProvider(primaryConfig, requestParams, credentials, startTime, log);

  if (result.success) return result;

  // 5. Failover to alternate (only for retriable errors and auto-select mode)
  if (
    alternateConfig &&
    alternateCredentials &&
    !NON_RETRIABLE.has(result.status || 0) &&
    Date.now() - startTime < GLOBAL_TIMEOUT_MS
  ) {
    if (log) {
      log.warn(
        "SEARCH",
        `${primaryConfig.id} failed (${result.status}), trying ${alternateConfig.id}`
      );
    }

    const fallbackResult = await tryProvider(
      alternateConfig,
      requestParams,
      alternateCredentials,
      startTime,
      log
    );

    if (fallbackResult.success) return fallbackResult;
  }

  return result;
}

async function tryProvider(
  config: SearchProviderConfig,
  params: Omit<ProviderRequestParams, "token">,
  credentials: Record<string, unknown>,
  globalStartTime: number,
  log?: {
    info?: (tag: string, message: string) => void;
    warn?: (tag: string, message: string) => void;
    error?: (tag: string, message: string) => void;
  }
): Promise<SearchHandlerResult> {
  const startTime = Date.now();
  const apiKey = credentials.apiKey;
  const accessToken = credentials.accessToken;
  const token =
    typeof apiKey === "string" && apiKey.length > 0
      ? apiKey
      : typeof accessToken === "string" && accessToken.length > 0
        ? accessToken
        : "";

  if (!token) {
    return {
      success: false,
      status: 401,
      error: `No credentials for search provider: ${config.id}`,
    };
  }

  const { query, searchType, maxResults } = params;
  const { url, init } = buildRequest(config, { ...params, token });

  // Timeout: min of provider timeout and remaining global timeout
  const remainingGlobal = GLOBAL_TIMEOUT_MS - (Date.now() - globalStartTime);
  const timeout = Math.min(config.timeoutMs, Math.max(remainingGlobal, 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (log) {
    log.info("SEARCH", `${config.id} | query: "${query.slice(0, 80)}" | type: ${searchType}`);
  }

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("SEARCH", `${config.id} error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      saveCallLog({
        method: config.method,
        path: "/v1/search",
        status: response.status,
        model: config.id,
        provider: config.id,
        duration: Date.now() - startTime,
        requestType: "search",
        error: errorText.slice(0, 500),
        requestBody: {
          query: query.slice(0, 200),
          search_type: searchType,
          max_results: maxResults,
        },
      }).catch(() => {
        /* non-critical — logging must not block search response */
      });

      return {
        success: false,
        status: response.status,
        error: `Search provider ${config.id} returned ${response.status}`,
      };
    }

    const data = await response.json();
    const normalized = normalizeResponse(config.id, data, query, searchType);
    // Enforce max_results — some providers return more than requested
    const results = normalized.results.slice(0, maxResults);
    const totalResults = normalized.totalResults;
    const duration = Date.now() - startTime;

    saveCallLog({
      method: config.method,
      path: "/v1/search",
      status: 200,
      model: config.id,
      provider: config.id,
      duration,
      requestType: "search",
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      requestBody: { query: query.slice(0, 200), search_type: searchType, max_results: maxResults },
      responseBody: { results_count: results.length, cached: false },
    }).catch(() => {
      /* non-critical — logging must not block search response */
    });

    return {
      success: true,
      data: {
        provider: config.id,
        query,
        results,
        answer: null,
        usage: { queries_used: 1, search_cost_usd: config.costPerQuery },
        metrics: {
          response_time_ms: duration,
          upstream_latency_ms: duration,
          total_results_available: totalResults,
        },
        errors: [],
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);

    const errorMessage = err instanceof Error ? err.message : String(err);
    const isAbortError = err instanceof Error ? err.name === "AbortError" : false;
    const isTimeout = isAbortError;
    if (log) {
      log.error("SEARCH", `${config.id} ${isTimeout ? "timeout" : "fetch error"}: ${errorMessage}`);
    }

    saveCallLog({
      method: config.method,
      path: "/v1/search",
      status: isTimeout ? 504 : 502,
      model: config.id,
      provider: config.id,
      duration: Date.now() - startTime,
      requestType: "search",
      error: errorMessage,
      requestBody: { query: query.slice(0, 200), search_type: searchType, max_results: maxResults },
    }).catch(() => {
      /* non-critical — logging must not block search response */
    });

    return {
      success: false,
      status: isTimeout ? 504 : 502,
      error: `Search provider ${isTimeout ? "timeout" : "error"}: ${errorMessage}`,
    };
  }
}
