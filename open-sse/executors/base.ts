import { HTTP_STATUS, FETCH_TIMEOUT_MS } from "../config/constants.ts";
import { applyFingerprint, isCliCompatEnabled } from "../config/cliFingerprints.ts";
import { getRotatingApiKey } from "../services/apiKeyRotator.ts";
import type { ProviderRequestDefaults } from "../services/providerRequestDefaults.ts";
import { isClaudeCodeCompatible } from "../services/provider.ts";
import { signRequestBody } from "../services/claudeCodeCCH.ts";

/**
 * Sanitizes a custom API path to prevent path traversal attacks.
 * Valid paths must start with '/', contain no '..' segments,
 * no null bytes, and be reasonable in length.
 */
export function sanitizePath(path: string): boolean {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.includes("\0")) return false; // null byte
  if (path.includes("..")) return false; // path traversal
  if (path.length > 512) return false; // sanity limit
  return true;
}

type JsonRecord = Record<string, unknown>;

export type ProviderConfig = {
  id?: string;
  baseUrl?: string;
  baseUrls?: string[];
  responsesBaseUrl?: string;
  chatPath?: string;
  clientVersion?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  authUrl?: string;
  headers?: Record<string, string>;
  requestDefaults?: ProviderRequestDefaults;
  timeoutMs?: number;
};

export type ProviderCredentials = {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: string;
  connectionId?: string; // T07: used for API key rotation index
  providerSpecificData?: JsonRecord;
  requestEndpointPath?: string;
};

export type ExecutorLog = {
  debug?: (tag: string, message: string) => void;
  info?: (tag: string, message: string) => void;
  warn?: (tag: string, message: string) => void;
  error?: (tag: string, message: string) => void;
};

export type ExecuteInput = {
  model: string;
  body: unknown;
  stream: boolean;
  credentials: ProviderCredentials;
  signal?: AbortSignal | null;
  log?: ExecutorLog | null;
  extendedContext?: boolean;
  /** Merged after auth + CLI fingerprint headers (values override same-named defaults). */
  upstreamExtraHeaders?: Record<string, string> | null;
};

/** Apply model-level extra upstream headers (e.g. X-Custom-Auth). Never wipe executor auth. */
export function mergeUpstreamExtraHeaders(
  headers: Record<string, string>,
  extra?: Record<string, string> | null
): void {
  if (!extra) return;
  for (const [k, v] of Object.entries(extra)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "string") {
      if (k.toLowerCase() === "user-agent") {
        setUserAgentHeader(headers, v);
        continue;
      }
      const lower = k.toLowerCase();
      // Per-model upstreamHeaders must not replace Bearer auth with "" (OpenRouter returns 401
      // "Missing Authentication header"; merge order runs after executor buildHeaders).
      if (
        (lower === "authorization" ||
          lower === "proxy-authorization" ||
          lower === "authentication") &&
        !v.trim()
      ) {
        continue;
      }
      headers[k] = v;
    }
  }
}

export function getCustomUserAgent(providerSpecificData?: JsonRecord | null): string | null {
  const customUserAgent =
    typeof providerSpecificData?.customUserAgent === "string"
      ? providerSpecificData.customUserAgent.trim()
      : "";
  return customUserAgent || null;
}

export function setUserAgentHeader(headers: Record<string, string>, userAgent: string): void {
  headers["User-Agent"] = userAgent;
  if ("user-agent" in headers) {
    headers["user-agent"] = userAgent;
  }
}

export function applyConfiguredUserAgent(
  headers: Record<string, string>,
  providerSpecificData?: JsonRecord | null
): void {
  const customUserAgent = getCustomUserAgent(providerSpecificData);
  if (customUserAgent) {
    setUserAgentHeader(headers, customUserAgent);
  }
}

export function mergeAbortSignals(primary: AbortSignal, secondary: AbortSignal): AbortSignal {
  const controller = new AbortController();

  const abortBoth = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (primary.aborted || secondary.aborted) {
    abortBoth();
    return controller.signal;
  }

  primary.addEventListener("abort", abortBoth, { once: true });
  secondary.addEventListener("abort", abortBoth, { once: true });
  return controller.signal;
}

/** Resolve the effective upstream timeout for a provider config (ms). */
export function getRequestTimeoutMs(config: ProviderConfig): number {
  return typeof config.timeoutMs === "number" && config.timeoutMs > 0
    ? config.timeoutMs
    : FETCH_TIMEOUT_MS;
}

/**
 * Full-lifetime bounded signal: aborts when the caller disconnects OR the request
 * timeout elapses. Use for non-streaming requests and for executors that buffer
 * the whole upstream body before transforming it.
 */
export function buildUpstreamSignal(
  signal: AbortSignal | null | undefined,
  requestTimeoutMs: number
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  return signal ? mergeAbortSignals(signal, timeoutSignal) : timeoutSignal;
}

/**
 * Time-to-first-byte guard for streaming requests.
 *
 * Arms a timer that aborts the fetch if response HEADERS do not arrive within
 * `requestTimeoutMs`, then disarms it once headers arrive so healthy long-lived
 * streams are never truncated mid-body — stall detection after data starts
 * flowing is STREAM_IDLE_TIMEOUT_MS's job downstream. Caller-disconnect
 * propagation stays armed for the whole body lifetime via mergeAbortSignals.
 */
export function buildStreamTtfbGuard(
  signal: AbortSignal | null | undefined,
  requestTimeoutMs: number
): { signal: AbortSignal; headersReceived: () => void } {
  const ttfbController = new AbortController();
  // Abort with a TimeoutError-named reason so callers classify this exactly
  // like an AbortSignal.timeout expiry (execute() logs TIMEOUT on that name).
  const timer = setTimeout(() => {
    const err = new Error(`Upstream time-to-first-byte timeout after ${requestTimeoutMs}ms`);
    err.name = "TimeoutError";
    ttfbController.abort(err);
  }, requestTimeoutMs);
  return {
    signal: signal ? mergeAbortSignals(signal, ttfbController.signal) : ttfbController.signal,
    headersReceived: () => clearTimeout(timer),
  };
}

const newAbortError = () => {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
};

/**
 * Sleep that rejects as soon as `signal` aborts, so retry backoffs stop
 * immediately on client disconnect instead of holding a dead request's slot
 * (and then firing another upstream call) for the full delay.
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (!signal) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  }
  if (signal.aborted) return Promise.reject(newAbortError());
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(newAbortError());
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return promise;
}

/**
 * BaseExecutor - Base class for provider executors.
 * Implements the Strategy pattern: subclasses override specific methods
 * (buildUrl, buildHeaders, transformRequest, etc.) for each provider.
 */
export class BaseExecutor {
  provider: string;
  config: ProviderConfig;

  constructor(provider: string, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  getProvider() {
    return this.provider;
  }

  getBaseUrls() {
    return this.config.baseUrls || (this.config.baseUrl ? [this.config.baseUrl] : []);
  }

  getFallbackCount() {
    return this.getBaseUrls().length || 1;
  }

  buildUrl(
    model: string,
    stream: boolean,
    urlIndex = 0,
    credentials: ProviderCredentials | null = null
  ) {
    void model;
    void stream;
    if (this.provider?.startsWith?.("openai-compatible-")) {
      const psd = credentials?.providerSpecificData;
      const baseUrl = typeof psd?.baseUrl === "string" ? psd.baseUrl : "https://api.openai.com/v1";
      const normalized = baseUrl.replace(/\/$/, "");
      // Sanitize custom path: must start with '/', no path traversal, no null bytes
      const rawPath = typeof psd?.chatPath === "string" && psd.chatPath ? psd.chatPath : null;
      const customPath = rawPath && sanitizePath(rawPath) ? rawPath : null;
      if (customPath) return `${normalized}${customPath}`;
      const path = this.provider.includes("responses") ? "/responses" : "/chat/completions";
      return `${normalized}${path}`;
    }
    const baseUrls = this.getBaseUrls();
    return baseUrls[urlIndex] || baseUrls[0] || this.config.baseUrl;
  }

  buildHeaders(
    credentials: ProviderCredentials,
    stream = true,
    _clientHeaders?: Record<string, string> | null,
    _model?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    // Allow per-provider User-Agent override via environment variable.
    // Example: CLAUDE_USER_AGENT="my-agent/2.0" overrides the default for the Claude provider.
    const providerId = this.config?.id || this.provider;
    if (providerId) {
      const envKey = `${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_USER_AGENT`;
      const envUA = process.env[envKey]?.trim();
      if (envUA) {
        setUserAgentHeader(headers, envUA);
      }
    }

    if (credentials.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    } else if (credentials.apiKey) {
      // T07: rotate between primary + extra API keys when extraApiKeys is configured
      const extraKeys =
        (credentials.providerSpecificData?.extraApiKeys as string[] | undefined) ?? [];
      const effectiveKey =
        extraKeys.length > 0 && credentials.connectionId
          ? getRotatingApiKey(credentials.connectionId, credentials.apiKey, extraKeys)
          : credentials.apiKey;
      headers["Authorization"] = `Bearer ${effectiveKey}`;
    }

    if (stream) {
      headers["Accept"] = "text/event-stream";
    }

    return headers;
  }

  // Override in subclass for provider-specific transformations
  transformRequest(
    model: string,
    body: unknown,
    stream: boolean,
    credentials: ProviderCredentials
  ): unknown {
    void model;
    void stream;
    void credentials;
    return body;
  }

  shouldRetry(status: number, urlIndex: number) {
    return status === HTTP_STATUS.RATE_LIMITED && urlIndex + 1 < this.getFallbackCount();
  }

  // Intra-URL retry config: retry same URL before falling back to next node
  static readonly RETRY_CONFIG = { maxAttempts: 2, delayMs: 2000 };

  // Override in subclass for provider-specific refresh
  async refreshCredentials(credentials: ProviderCredentials, log: ExecutorLog | null) {
    void credentials;
    void log;
    return null;
  }

  needsRefresh(credentials: ProviderCredentials) {
    if (!credentials.expiresAt) return false;
    const expiresAtMs = new Date(credentials.expiresAt).getTime();
    return expiresAtMs - Date.now() < 5 * 60 * 1000;
  }

  parseError(response: Response, bodyText: string) {
    return { status: response.status, message: bodyText || `HTTP ${response.status}` };
  }

  async execute({
    model,
    body,
    stream,
    credentials,
    signal,
    log,
    extendedContext,
    upstreamExtraHeaders,
  }: ExecuteInput) {
    const fallbackCount = this.getFallbackCount();
    let lastError: unknown = null;
    let lastStatus = 0;
    // Track per-URL intra-retry attempts to avoid infinite loops
    const retryAttemptsByUrl: Record<number, number> = {};

    for (let urlIndex = 0; urlIndex < fallbackCount; urlIndex++) {
      const url = this.buildUrl(model, stream, urlIndex, credentials);
      const headers = this.buildHeaders(credentials, stream);
      applyConfiguredUserAgent(headers, credentials?.providerSpecificData);

      // Append 1M context beta header when [1m] suffix was used
      // Only supported for specific Claude models per Anthropic docs
      if (extendedContext) {
        const EXTENDED_CONTEXT_MODELS = [
          "claude-opus-4-6",
          "claude-sonnet-4-6",
          "claude-sonnet-4-5",
          "claude-sonnet-4",
        ];
        const baseModel = model.replace(/-\d{8}$/, "");
        if (
          EXTENDED_CONTEXT_MODELS.some((m) => baseModel === m || model === m || model.startsWith(m))
        ) {
          const existing = headers["Anthropic-Beta"];
          if (existing) {
            headers["Anthropic-Beta"] = existing + ",context-1m-2025-08-07";
          } else {
            headers["Anthropic-Beta"] = "context-1m-2025-08-07";
          }
        }
      }

      const transformedBody = await this.transformRequest(model, body, stream, credentials);

      // Apply a timeout to all requests so unresponsive providers cannot hang the
      // caller (e.g. 300s TCP default timeout — #769).
      //
      // Streaming requests bound only TIME-TO-FIRST-BYTE here: once response
      // headers arrive the clock is disarmed and healthy long-lived streams are
      // never truncated mid-body — stall detection after data starts flowing is
      // STREAM_IDLE_TIMEOUT_MS's job downstream. Non-streaming requests keep the
      // full-lifetime timeout because their body is consumed under this signal.
      const requestTimeoutMs = getRequestTimeoutMs(this.config);
      const streamTtfbGuard = stream
        ? buildStreamTtfbGuard(signal ?? null, requestTimeoutMs)
        : null;

      try {
        const combinedSignal =
          streamTtfbGuard?.signal ?? buildUpstreamSignal(signal, requestTimeoutMs);

        // Apply CLI fingerprint ordering if enabled for this provider
        let finalHeaders = headers;
        let bodyString = JSON.stringify(transformedBody);

        if (isCliCompatEnabled(this.provider)) {
          const fingerprinted = applyFingerprint(this.provider, headers, transformedBody);
          finalHeaders = fingerprinted.headers;
          bodyString = fingerprinted.bodyString;
        }

        // CCH signing: Claude Code-compatible providers require an xxHash64 integrity
        // token over the serialized body. Sign after fingerprint ordering so the hash
        // covers the exact bytes that will be sent upstream.
        if (isClaudeCodeCompatible(this.provider)) {
          bodyString = await signRequestBody(bodyString);
        }

        mergeUpstreamExtraHeaders(finalHeaders, upstreamExtraHeaders);

        const fetchOptions: RequestInit = {
          method: "POST",
          headers: finalHeaders,
          body: bodyString,
        };
        if (combinedSignal) fetchOptions.signal = combinedSignal;

        const response = await fetch(url, fetchOptions);
        // Headers arrived: stop the streaming TTFB clock (no-op when null).
        streamTtfbGuard?.headersReceived();

        // Intra-URL retry: if 429 and we haven't exhausted per-URL retries, wait and retry the same URL
        if (
          response.status === HTTP_STATUS.RATE_LIMITED &&
          (retryAttemptsByUrl[urlIndex] ?? 0) < BaseExecutor.RETRY_CONFIG.maxAttempts
        ) {
          retryAttemptsByUrl[urlIndex] = (retryAttemptsByUrl[urlIndex] ?? 0) + 1;
          const attempt = retryAttemptsByUrl[urlIndex];
          log?.debug?.(
            "RETRY",
            `429 intra-retry ${attempt}/${BaseExecutor.RETRY_CONFIG.maxAttempts} on ${url} — waiting ${BaseExecutor.RETRY_CONFIG.delayMs}ms`
          );
          await sleepWithAbort(BaseExecutor.RETRY_CONFIG.delayMs, combinedSignal);
          urlIndex--; // re-run this urlIndex on the next loop iteration
          continue;
        }

        if (this.shouldRetry(response.status, urlIndex)) {
          log?.debug?.("RETRY", `${response.status} on ${url}, trying fallback ${urlIndex + 1}`);
          lastStatus = response.status;
          continue;
        }

        return { response, url, headers: finalHeaders, transformedBody };
      } catch (error) {
        // Distinguish timeout errors from other abort errors
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.name === "TimeoutError") {
          log?.warn?.(
            "TIMEOUT",
            `Upstream timeout after ${getRequestTimeoutMs(this.config)}ms on ${url}`
          );
        }
        streamTtfbGuard?.headersReceived();
        // The client is gone — stop immediately instead of failing over to the
        // next URL and firing an upstream request nobody will read.
        if (signal?.aborted) throw err;
        lastError = err;
        if (urlIndex + 1 < fallbackCount) {
          log?.debug?.("RETRY", `Error on ${url}, trying fallback ${urlIndex + 1}`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error(`All ${fallbackCount} URLs failed with status ${lastStatus}`);
  }
}

export default BaseExecutor;
