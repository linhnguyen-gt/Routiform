import { recordCost } from "@/domain/costRules";
import { getCacheControlSettings } from "@/lib/cacheControlSettings";
import { isDetailedLoggingEnabled } from "@/lib/db/detailedLogs";
import { updateProviderConnection } from "@/lib/db/providers";
import {
  getModelNormalizeToolCallId,
  getModelPreserveOpenAIDeveloperRole,
  getModelUpstreamExtraHeaders,
  getUpstreamProxyConfig,
} from "@/lib/localDb";
import { calculateCost } from "@/lib/usage/costCalculator";
import { formatUsageLog } from "@/lib/usage/tokenAccounting";
import {
  appendRequestLog,
  saveCallLog,
  saveRequestUsage,
  trackPendingRequest,
} from "@/lib/usageDb";
import { COOLDOWN_MS, HTTP_STATUS, getProviderMaxTokensCap } from "../config/constants.ts";
import { PROVIDER_ID_TO_ALIAS, getModelTargetFormat } from "../config/providerModels.ts";
import { getUnsupportedParams } from "../config/providerRegistry.ts";
import { getExecutor } from "../executors/index.ts";
import { lockModelIfPerModelQuota } from "../services/accountFallback.ts";
import {
  PROVIDER_ERROR_TYPES,
  classifyProviderError,
  isEmptyContentResponse,
} from "../services/errorClassifier.ts";
import { resolveModelAlias } from "../services/modelDeprecation.ts";
import { detectFormatFromEndpoint, getTargetFormat } from "../services/provider.ts";
import { refreshWithRetry } from "../services/tokenRefresh.ts";
import { FORMATS } from "../translator/formats.ts";
import { needsTranslation, translateRequest } from "../translator/index.ts";
import { handleBypassRequest } from "../utils/bypassHandler.ts";
import {
  providerSupportsCaching,
  shouldPreserveCacheControl,
} from "../utils/cacheControlPolicy.ts";
import { getCorsOrigin } from "../utils/cors.ts";
import {
  buildErrorBody,
  createErrorResult,
  formatProviderError,
  parseUpstreamError,
} from "../utils/error.ts";
import { createRequestLogger } from "../utils/requestLogger.ts";
import {
  COLORS,
  createPassthroughStreamWithLogger,
  createSSETransformStreamWithLogger,
} from "../utils/stream.ts";
import { createStreamController, pipeWithDisconnect } from "../utils/streamHandler.ts";
import { addBufferToUsage, estimateUsage, filterUsageForFormat } from "../utils/usageTracking.ts";
import { handleIdempotencyCheck } from "./phases/idempotency-check.ts";
import { sanitizeRequestInput } from "./phases/input-sanitizer.ts";
import { checkSemanticCache } from "./phases/semantic-cache-handler.ts";
import { persistCodexQuotaState } from "./services/codex-quota-manager.ts";
import {
  attachLogMeta,
  buildCacheUsageLogMeta,
  buildClaudePromptCacheLogMeta,
} from "./utils/cache-log-helpers.ts";
import {
  buildClaudePassthroughToolNameMap,
  restoreClaudePassthroughToolNames,
} from "./utils/claude-passthrough-helpers.ts";

import { getIdempotencyKey, saveIdempotency } from "@/lib/idempotencyLayer";
import { normalizePayloadForLog } from "@/lib/logPayloads";
import { generateSignature, isCacheable, setCachedResponse } from "@/lib/semanticCache";
import { generateRequestId } from "@/shared/utils/requestId";
import packageJson from "../../package.json";
import {
  buildClaudeCodeCompatibleRequest,
  isClaudeCodeCompatibleProvider,
  resolveClaudeCodeCompatibleSessionId,
} from "../services/claudeCodeCompatible.ts";
import { getNextFamilyFallback } from "../services/modelFamilyFallback.ts";
import {
  initializeRateLimits,
  updateFromHeaders,
  withRateLimit,
} from "../services/rateLimitManager.ts";
import { computeRequestHash, deduplicate, shouldDeduplicate } from "../services/requestDedup.ts";
import {
  resolveExplicitStreamAlias,
  resolveStreamFlag,
  stripMarkdownCodeFence,
  stripNonStandardStreamAliases,
} from "../utils/aiSdkCompat.ts";
import { isDroidCliUserAgent } from "../utils/clientDetection.ts";
import { optimizeGithubRequestBody } from "../utils/githubRequestOptimizer.ts";
import { createProgressTransform, wantsProgress } from "../utils/progressTracker.ts";
import { handleBackgroundTaskRedirection } from "./phases/background-task-redirector.ts";
import { validateAndCompressContext } from "./phases/context-validator.ts";
import { handleEmergencyFallback } from "./phases/emergency-fallback-handler.ts";
import {
  handleModelFallback,
  shouldAttemptModelFallback,
} from "./phases/model-fallback-handler.ts";
import { sanitizeOpenAIResponse } from "./responseSanitizer.ts";
import { translateNonStreamingResponse } from "./responseTranslator.ts";
import {
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse,
  parseSSEToResponsesOutput,
} from "./sseParser.ts";
import { extractUsageFromResponse } from "./usageExtractor.ts";

export function shouldUseNativeCodexPassthrough({
  provider,
  sourceFormat,
  endpointPath,
}: {
  provider?: string | null;
  sourceFormat?: string | null;
  endpointPath?: string | null;
}): boolean {
  if (provider !== "codex") return false;
  if (sourceFormat !== FORMATS.OPENAI_RESPONSES) return false;
  let normalizedEndpoint = String(endpointPath || "");
  while (normalizedEndpoint.endsWith("/")) normalizedEndpoint = normalizedEndpoint.slice(0, -1);
  const segments = normalizedEndpoint.split("/");
  return segments.includes("responses");
}

function toPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Core chat handler - shared between SSE and Worker
 * Returns { success, response, status, error } for caller to handle fallback
 * @param {object} options
 * @param {object} options.body - Request body
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} options.log - Logger instance (optional)
 * @param {function} options.onCredentialsRefreshed - Callback when credentials are refreshed
 * @param {function} options.onRequestSuccess - Callback when request succeeds (to clear error status)
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object} options.apiKeyInfo - API key metadata for usage attribution
 * @param {string} options.userAgent - Client user agent for caching decisions
 * @param {string} options.comboName - Combo name if this is a combo request
 * @param {string} options.comboStrategy - Combo routing strategy (e.g., 'priority', 'cost-optimized')
 * @param {boolean} options.isCombo - Whether this request is from a combo
 * @param {string} options.connectionId - Connection ID for settings lookup
 */

/**
 * Module-level cache for upstream proxy config (shared across all requests).
 * 10s TTL prevents per-request DB lookups while staying fresh enough for setting changes.
 */
const _proxyConfigCache = new Map<string, { mode: string; enabled: boolean; ts: number }>();
const PROXY_CONFIG_CACHE_TTL = 10_000;

/**
 * Claude Code hits POST /v1/messages → we translate claude→openai before GitHub Copilot.
 * OpenCode hits POST /v1/chat/completions → source/target are both OpenAI (near-passthrough),
 * so the upstream payload can differ and Copilot returns opaque 400. Round-trip through
 * Anthropic-shaped messages so the GitHub executor sees the same shape as Messages clients.
 */
/** @internal Exported for unit tests */
export function shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
  provider: string,
  sourceFormat: string,
  targetFormat: string,
  resolvedModelId: string
): boolean {
  if (provider !== "github") return false;
  if (sourceFormat !== FORMATS.OPENAI || targetFormat !== FORMATS.OPENAI) return false;
  const m = (resolvedModelId || "").toLowerCase();
  if (!m.includes("claude-")) return false;
  if (/(^|-)codex($|-)/.test(m)) return false;
  return true;
}

async function getUpstreamProxyConfigCached(providerId: string) {
  const cached = _proxyConfigCache.get(providerId);
  if (cached && Date.now() - cached.ts < PROXY_CONFIG_CACHE_TTL) return cached;
  const cfg = await getUpstreamProxyConfig(providerId).catch(() => null);
  const result = cfg
    ? { mode: cfg.mode, enabled: cfg.enabled, ts: Date.now() }
    : { mode: "native" as const, enabled: false, ts: Date.now() };
  _proxyConfigCache.set(providerId, result);
  return result;
}

export async function handleChatCore({
  body,
  modelInfo,
  credentials,
  log,
  onCredentialsRefreshed,
  onRequestSuccess,
  onDisconnect,
  clientRawRequest,
  connectionId,
  apiKeyInfo = null,
  userAgent,
  comboName,
  comboStrategy = null,
  isCombo = false,
  combo = null,
}) {
  let { provider, model, extendedContext } = modelInfo;
  const requestedModel =
    typeof body?.model === "string" && body.model.trim().length > 0 ? body.model : model;
  const startTime = Date.now();
  const persistFailureUsage = (statusCode: number, errorCode?: string | null) => {
    saveRequestUsage({
      provider: provider || "unknown",
      model: model || "unknown",
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0 },
      status: String(statusCode),
      success: false,
      latencyMs: Date.now() - startTime,
      timeToFirstTokenMs: 0,
      errorCode: errorCode || String(statusCode),
      timestamp: new Date().toISOString(),
      connectionId: connectionId || undefined,
      apiKeyId: apiKeyInfo?.id || undefined,
      apiKeyName: apiKeyInfo?.name || undefined,
    }).catch(() => {});
  };

  // ── Phase 9.2: Idempotency check ──
  const idempotencyKey = getIdempotencyKey(clientRawRequest?.headers);
  const idempotentResponse = handleIdempotencyCheck(clientRawRequest, log);
  if (idempotentResponse) {
    return {
      success: true,
      response: idempotentResponse,
    };
  }

  // Initialize rate limit settings from persisted DB (once, lazy)
  await initializeRateLimits();

  // T07: Inject connectionId into credentials so executors can rotate API keys
  // using providerSpecificData.extraApiKeys (API Key Round-Robin feature)
  if (connectionId && credentials && !credentials.connectionId) {
    credentials.connectionId = connectionId;
  }

  const endpointPath = String(clientRawRequest?.endpoint || "");
  const sourceFormat = detectFormatFromEndpoint(body, endpointPath);
  const isResponsesEndpoint =
    /\/responses(?=\/|$)/i.test(endpointPath) || /^responses(?=\/|$)/i.test(endpointPath);
  const nativeCodexPassthrough = shouldUseNativeCodexPassthrough({
    provider,
    sourceFormat,
    endpointPath,
  });

  // Check for bypass patterns (warmup, skip) - return fake response
  const bypassResponse = handleBypassRequest(body, model, userAgent);
  if (bypassResponse) {
    return bypassResponse;
  }

  // Detect source format and get target format
  // Model-specific targetFormat takes priority over provider default

  // ── Background Task Redirection (T41) ──
  model = handleBackgroundTaskRedirection({
    model,
    body,
    headers: clientRawRequest?.headers,
    apiKeyInfo,
    connectionId,
    provider,
    log,
  });

  // Apply custom model aliases (Settings → Model Aliases → Pattern→Target) before routing (#315, #472)
  // Custom aliases take priority over built-in and must be resolved here so the
  // downstream getModelTargetFormat() lookup AND the actual provider request use
  // the correct, aliased model ID. Without this, aliases only affect format detection.
  const resolvedModel = resolveModelAlias(model);
  // Use resolvedModel for all downstream operations (routing, provider requests, logging)
  const effectiveModel = resolvedModel !== model ? resolvedModel : model;
  if (resolvedModel !== model) {
    log?.info?.("ALIAS", `Model alias applied: ${model} → ${resolvedModel}`);
  }

  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  const modelTargetFormat = getModelTargetFormat(alias, resolvedModel);
  const targetFormat = modelTargetFormat || getTargetFormat(provider);
  const noLogEnabled = apiKeyInfo?.noLog === true;
  const detailedLoggingEnabled = !noLogEnabled && (await isDetailedLoggingEnabled());
  const persistAttemptLogs = ({
    status,
    tokens,
    responseBody,
    error,
    providerResponse,
    clientResponse,
    claudeCacheMeta,
    claudeCacheUsageMeta,
  }: {
    status: number;
    tokens?: unknown;
    responseBody?: unknown;
    error?: string | null;
    providerRequest?: unknown;
    providerResponse?: unknown;
    clientResponse?: unknown;
    claudeCacheMeta?: Record<string, unknown>;
    claudeCacheUsageMeta?: Record<string, unknown>;
  }) => {
    const callLogId = generateRequestId();
    const pipelinePayloads = detailedLoggingEnabled ? reqLogger?.getPipelinePayloads?.() : null;

    if (pipelinePayloads) {
      if (providerResponse !== undefined) {
        pipelinePayloads.providerResponse = providerResponse as Record<string, unknown>;
      }
      if (clientResponse !== undefined) {
        pipelinePayloads.clientResponse = clientResponse as Record<string, unknown>;
      }
      if (error) {
        pipelinePayloads.error = {
          ...(typeof pipelinePayloads.error === "object" && pipelinePayloads.error
            ? (pipelinePayloads.error as Record<string, unknown>)
            : {}),
          message: error,
        };
      }
    }

    saveCallLog({
      id: callLogId,
      method: "POST",
      path: clientRawRequest?.endpoint || "/v1/chat/completions",
      status,
      model,
      requestedModel,
      provider,
      connectionId,
      duration: Date.now() - startTime,
      tokens: tokens || {},
      requestBody: attachLogMeta((body as Record<string, unknown>) ?? undefined, {
        claudePromptCache: claudeCacheMeta,
      }),
      responseBody: attachLogMeta((responseBody as Record<string, unknown>) ?? undefined, {
        claudePromptCache: claudeCacheMeta
          ? {
              applied: claudeCacheMeta.applied,
              totalBreakpoints: claudeCacheMeta.totalBreakpoints,
              anthropicBeta: claudeCacheMeta.anthropicBeta,
            }
          : null,
        claudePromptCacheUsage: claudeCacheUsageMeta,
      }),
      error: error || null,
      sourceFormat,
      targetFormat,
      comboName,
      apiKeyId: apiKeyInfo?.id || null,
      apiKeyName: apiKeyInfo?.name || null,
      noLog: noLogEnabled,
      pipelinePayloads,
    }).catch(() => {});
  };

  // Primary path: merge client model id + alias target so config on either key applies; resolved
  // id wins on same header name. T5 family fallback uses only (nextModel, resolveModelAlias(next))
  // so A-model headers are not sent to B — see buildUpstreamHeadersForExecute.
  const connectionCustomUserAgent =
    credentials?.providerSpecificData &&
    typeof credentials.providerSpecificData === "object" &&
    typeof credentials.providerSpecificData.customUserAgent === "string"
      ? credentials.providerSpecificData.customUserAgent.trim()
      : "";

  const buildUpstreamHeadersForExecute = (modelToCall: string): Record<string, string> => {
    const name = packageJson.name;
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    const upstreamHeaders =
      modelToCall === effectiveModel
        ? {
            ...getModelUpstreamExtraHeaders(provider || "", model || "", sourceFormat),
            ...getModelUpstreamExtraHeaders(provider || "", resolvedModel || "", sourceFormat),
          }
        : (() => {
            const r = resolveModelAlias(modelToCall);
            return {
              ...getModelUpstreamExtraHeaders(provider || "", modelToCall || "", sourceFormat),
              ...getModelUpstreamExtraHeaders(provider || "", r || "", sourceFormat),
            };
          })();

    if (connectionCustomUserAgent) {
      upstreamHeaders["User-Agent"] = connectionCustomUserAgent;
      if ("user-agent" in upstreamHeaders) {
        upstreamHeaders["user-agent"] = connectionCustomUserAgent;
      }
    }

    if (provider === "openrouter") {
      const appTitle = capitalized;
      if (appTitle) {
        upstreamHeaders["X-OpenRouter-Title"] = appTitle;
        upstreamHeaders["X-Title"] = appTitle;
      }
    }

    return upstreamHeaders;
  };

  // Default to false unless client explicitly sets stream: true (OpenAI spec compliant)
  const acceptHeader =
    clientRawRequest?.headers && typeof clientRawRequest.headers.get === "function"
      ? clientRawRequest.headers.get("accept") || clientRawRequest.headers.get("Accept")
      : (clientRawRequest?.headers || {})["accept"] || (clientRawRequest?.headers || {})["Accept"];

  const explicitStreamAlias = resolveExplicitStreamAlias(body);
  if (explicitStreamAlias !== undefined && body && typeof body === "object") {
    (body as Record<string, unknown>).stream = explicitStreamAlias;
  }
  const stream = resolveStreamFlag(body?.stream, acceptHeader);
  // Accept aliases only at Routiform API boundary, then strip before provider translation/execution.
  stripNonStandardStreamAliases(body);

  // ── Phase 9.1: Semantic cache check (non-streaming, temp=0 only) ──
  const cachedResponse = checkSemanticCache(model, body, clientRawRequest, log);
  if (cachedResponse) {
    return {
      success: true,
      response: cachedResponse,
    };
  }

  // Create request logger for this session: sourceFormat_targetFormat_model
  const reqLogger = await createRequestLogger(sourceFormat, targetFormat, model);

  // 0. Log client raw request (before format conversion)
  if (clientRawRequest) {
    reqLogger.logClientRawRequest(
      clientRawRequest.endpoint,
      clientRawRequest.body,
      clientRawRequest.headers
    );
  }

  log?.debug?.("FORMAT", `${sourceFormat} → ${targetFormat} | stream=${stream}`);

  // ── Common input sanitization (runs for ALL paths including passthrough) ──
  body = await sanitizeRequestInput(body, provider, apiKeyInfo, log);

  // ── Phase 1 & 2: Context Validation & Compression ──
  const contextResult = validateAndCompressContext({
    body,
    provider,
    model: effectiveModel,
    combo,
    comboName,
    reqLogger,
    log,
    persistFailureUsage,
  });

  if (!contextResult.valid) {
    return contextResult.error!;
  }

  body = contextResult.body;

  // Translate request (pass reqLogger for intermediate logging)
  let translatedBody = body;
  const isClaudePassthrough = sourceFormat === FORMATS.CLAUDE && targetFormat === FORMATS.CLAUDE;
  const isClaudeCodeCompatible = isClaudeCodeCompatibleProvider(provider);
  const upstreamStream = stream || isClaudeCodeCompatible;
  let ccSessionId: string | null = null;

  // Determine if we should preserve client-side cache_control headers
  // Fetch settings from DB to get user preference
  const cacheControlMode = await getCacheControlSettings().catch(() => "auto" as const);
  const preserveCacheControl = shouldPreserveCacheControl({
    userAgent,
    isCombo,
    comboStrategy,
    targetProvider: provider,
    targetFormat,
    settings: { alwaysPreserveClientCache: cacheControlMode },
  });

  if (preserveCacheControl) {
    log?.debug?.(
      "CACHE",
      `Preserving client cache_control (client=${userAgent?.substring(0, 20)}, combo=${isCombo}, strategy=${comboStrategy}, provider=${provider})`
    );
  }

  try {
    if (nativeCodexPassthrough) {
      translatedBody = { ...body, _nativeCodexPassthrough: true };
      log?.debug?.("FORMAT", "native codex passthrough enabled");
    } else if (isClaudeCodeCompatible) {
      let normalizedForCc = { ...body };

      // Claude Code-compatible providers expect Anthropic Messages-shaped payloads,
      // but we extract only role/text/max_tokens/effort from an OpenAI-like view first.
      if (sourceFormat !== FORMATS.OPENAI) {
        const normalizeToolCallId = getModelNormalizeToolCallId(
          provider || "",
          model || "",
          sourceFormat
        );
        const preserveDeveloperRole = getModelPreserveOpenAIDeveloperRole(
          provider || "",
          model || "",
          sourceFormat
        );
        normalizedForCc = translateRequest(
          sourceFormat,
          FORMATS.OPENAI,
          model,
          { ...body },
          stream,
          credentials,
          provider,
          reqLogger,
          { normalizeToolCallId, preserveDeveloperRole, preserveCacheControl }
        );
      }

      ccSessionId = resolveClaudeCodeCompatibleSessionId(clientRawRequest?.headers);
      translatedBody = buildClaudeCodeCompatibleRequest({
        sourceBody: body,
        normalizedBody: normalizedForCc,
        claudeBody: sourceFormat === FORMATS.CLAUDE ? body : null,
        model,
        stream: upstreamStream,
        sessionId: ccSessionId,
        cwd: process.cwd(),
        now: new Date(),
        preserveCacheControl,
      });
      log?.debug?.("FORMAT", "claude-code-compatible bridge enabled");
    } else if (isClaudePassthrough && preserveCacheControl) {
      // Pure passthrough: when preserveCacheControl is true, forward the body
      // as-is without prior normalization. The OpenAI round-trip would strip
      // cache_control markers; even prepareClaudeRequest can alter structure.
      // Claude Code sends well-formed Messages API payloads — trust it.
      translatedBody = { ...body };
      translatedBody._disableToolPrefix = true;

      log?.debug?.("FORMAT", "claude passthrough with cache_control preservation");
    } else if (isClaudePassthrough) {
      // Claude OAuth expects the same Claude Code prompt + structural normalization
      // as the OpenAI-compatible chat path. Round-trip through OpenAI to reuse the
      // working Claude translator instead of forwarding raw Messages payloads.
      const normalizeToolCallId = getModelNormalizeToolCallId(
        provider || "",
        model || "",
        sourceFormat
      );
      const preserveDeveloperRole = getModelPreserveOpenAIDeveloperRole(
        provider || "",
        model || "",
        sourceFormat
      );
      translatedBody = translateRequest(
        FORMATS.CLAUDE,
        FORMATS.OPENAI,
        model,
        { ...body },
        stream,
        credentials,
        provider,
        reqLogger,
        { normalizeToolCallId, preserveDeveloperRole, preserveCacheControl }
      );
      translatedBody = translateRequest(
        FORMATS.OPENAI,
        FORMATS.CLAUDE,
        model,
        { ...translatedBody, _disableToolPrefix: true },
        stream,
        credentials,
        provider,
        reqLogger,
        { normalizeToolCallId, preserveDeveloperRole, preserveCacheControl }
      );
      log?.debug?.("FORMAT", "claude->openai->claude normalized passthrough");
    } else {
      translatedBody = { ...body };

      // Issue #199 + #618: Always disable tool name prefix in Claude passthrough.
      // The proxy_ prefix was designed for OpenAI→Claude translation to avoid
      // conflicts with Claude OAuth tools, but in the passthrough path the tools
      // are already in Claude format. Applying the prefix turns "Bash" into
      // "proxy_Bash", which Claude rejects ("No such tool available: proxy_Bash").
      if (targetFormat === FORMATS.CLAUDE) {
        translatedBody._disableToolPrefix = true;
      }

      // Strip empty text content blocks from messages.
      // Anthropic API rejects {"type":"text","text":""} with 400 "text content blocks must be non-empty".
      // Some clients (LiteLLM passthrough, @ai-sdk/anthropic) may forward these empty blocks as-is.
      if (Array.isArray(translatedBody.messages)) {
        for (const msg of translatedBody.messages) {
          if (Array.isArray(msg.content)) {
            msg.content = msg.content.filter(
              (block: Record<string, unknown>) =>
                block.type !== "text" || (typeof block.text === "string" && block.text.length > 0)
            );
          }
        }
      }

      // ── #409: Normalize unsupported content part types ──
      // Cursor and other clients send {type:"file"} when attaching .md or other files.
      // Providers (Copilot, OpenAI) only accept "text" and "image_url" in content arrays.
      // Convert: file → text (extract content), drop unrecognized types with a warning.
      const maybeParseJsonString = (value: unknown): unknown => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        if (!trimmed || !(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      };

      const isImageToolResultContent = (value: unknown): boolean => {
        if (Array.isArray(value)) {
          return value.some(
            (item) =>
              item &&
              typeof item === "object" &&
              ((item as Record<string, unknown>).type === "image" ||
                (item as Record<string, unknown>).type === "image_url")
          );
        }

        const parsed = maybeParseJsonString(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
        const obj = parsed as Record<string, unknown>;
        const mimeType =
          (typeof obj.mimeType === "string" ? obj.mimeType : null) ||
          (typeof obj.mime_type === "string" ? obj.mime_type : null);
        return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
      };

      const extractImageToolResultPayload = (
        value: unknown
      ): { imageUrl: string; text: string } | null => {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (!item || typeof item !== "object") continue;
            const record = item as Record<string, unknown>;
            if (record.type === "image_url") {
              const imageUrl =
                typeof record.image_url === "string"
                  ? record.image_url
                  : typeof (record.image_url as Record<string, unknown> | undefined)?.url ===
                      "string"
                    ? String((record.image_url as Record<string, unknown>).url)
                    : "";
              if (imageUrl) {
                return { imageUrl, text: "[Image attached from tool result]" };
              }
            }
            if (record.type === "image") {
              const source = record.source as Record<string, unknown> | undefined;
              const mediaType =
                typeof source?.media_type === "string" ? source.media_type : "image/png";
              const data = typeof source?.data === "string" ? source.data : "";
              if (data) {
                return {
                  imageUrl: `data:${mediaType};base64,${data}`,
                  text: "[Image attached from tool result]",
                };
              }
            }
          }
        }

        const parsed = maybeParseJsonString(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        const obj = parsed as Record<string, unknown>;
        const mimeType =
          (typeof obj.mimeType === "string" ? obj.mimeType : null) ||
          (typeof obj.mime_type === "string" ? obj.mime_type : null);
        const base64Data = typeof obj.data === "string" ? obj.data : null;
        if (mimeType && base64Data && mimeType.toLowerCase().startsWith("image/")) {
          return {
            imageUrl: `data:${mimeType};base64,${base64Data}`,
            text:
              typeof obj.text === "string" && obj.text.trim()
                ? obj.text
                : "[Image attached from tool result]",
          };
        }
        return null;
      };

      if (Array.isArray(translatedBody.messages)) {
        for (const msg of translatedBody.messages) {
          if (msg.role === "user" && Array.isArray(msg.content)) {
            msg.content = (msg.content as Record<string, unknown>[]).flatMap(
              (block: Record<string, unknown>) => {
                if (block.type === "text" || block.type === "image_url" || block.type === "image") {
                  return [block];
                }
                // file / document → extract text content
                if (block.type === "file" || block.type === "document") {
                  const fileContent =
                    (block.file as Record<string, unknown>)?.content ??
                    (block.file as Record<string, unknown>)?.text ??
                    block.content ??
                    block.text;
                  const fileName =
                    (block.file as Record<string, unknown>)?.name ?? block.name ?? "attachment";
                  if (typeof fileContent === "string" && fileContent.length > 0) {
                    return [{ type: "text", text: `[${fileName}]\n${fileContent}` }];
                  }
                  return [];
                }
                // (#527) tool_result → convert to text instead of dropping.
                // When Claude Code + superpowers routes through Codex, it sends tool_result
                // blocks in user messages. Silently dropping them causes Codex to loop
                // because it never receives the tool response and keeps re-requesting it.
                if (block.type === "tool_result") {
                  const toolId = block.tool_use_id ?? block.id ?? "unknown";
                  const resultContent = block.content ?? block.text ?? block.output ?? "";
                  if (isImageToolResultContent(resultContent)) {
                    return [block];
                  }
                  const resultText =
                    typeof resultContent === "string"
                      ? resultContent
                      : Array.isArray(resultContent)
                        ? resultContent
                            .filter((c: Record<string, unknown>) => c.type === "text")
                            .map((c: Record<string, unknown>) => c.text)
                            .join("\n")
                        : JSON.stringify(resultContent);
                  if (resultText.length > 0) {
                    return [{ type: "text", text: `[Tool Result: ${toolId}]\n${resultText}` }];
                  }
                  return [];
                }
                // Unknown types: drop silently
                log?.debug?.("CONTENT", `Dropped unsupported content part type="${block.type}"`);
                return [];
              }
            );
          }
        }
      }

      if (
        (targetFormat === FORMATS.OPENAI || targetFormat === FORMATS.OPENAI_RESPONSES) &&
        Array.isArray(translatedBody.messages)
      ) {
        const rewrittenMessages: Record<string, unknown>[] = [];
        for (const msg of translatedBody.messages as Record<string, unknown>[]) {
          rewrittenMessages.push(msg);
          if (msg.role !== "tool") continue;
          const imagePayload = extractImageToolResultPayload(msg.content);
          if (!imagePayload) continue;

          msg.content = imagePayload.text;
          rewrittenMessages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: "Use the attached image from the previous tool result when answering.",
              },
              {
                type: "image_url",
                image_url: { url: imagePayload.imageUrl },
              },
            ],
          });
        }
        translatedBody.messages = rewrittenMessages;
      }

      const normalizeToolCallId = getModelNormalizeToolCallId(
        provider || "",
        model || "",
        sourceFormat
      );
      const preserveDeveloperRole = getModelPreserveOpenAIDeveloperRole(
        provider || "",
        model || "",
        sourceFormat
      );
      const translateOpts = {
        normalizeToolCallId,
        preserveDeveloperRole,
        preserveCacheControl,
      };

      if (
        shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
          provider || "",
          sourceFormat,
          targetFormat,
          String(resolvedModel || "")
        )
      ) {
        const anthropicShaped = translateRequest(
          FORMATS.OPENAI,
          FORMATS.CLAUDE,
          model,
          translatedBody,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
        translatedBody = translateRequest(
          FORMATS.CLAUDE,
          FORMATS.OPENAI,
          model,
          anthropicShaped,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
        log?.debug?.(
          "FORMAT",
          "github Claude: OpenAI→Claude→OpenAI bridge (parity with /v1/messages clients)"
        );
      } else {
        translatedBody = translateRequest(
          sourceFormat,
          targetFormat,
          model,
          translatedBody,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
      }
    }
  } catch (error) {
    const parsedStatus = Number(error?.statusCode);
    const statusCode =
      Number.isInteger(parsedStatus) && parsedStatus >= 400 && parsedStatus <= 599
        ? parsedStatus
        : HTTP_STATUS.SERVER_ERROR;
    const message = error?.message || "Invalid request";
    const errorType = typeof error?.errorType === "string" ? error.errorType : null;

    log?.warn?.("TRANSLATE", `Request translation failed: ${message}`);

    if (errorType) {
      return {
        success: false,
        status: statusCode,
        error: message,
        response: new Response(
          JSON.stringify({
            error: {
              message,
              type: errorType,
              code: errorType,
            },
          }),
          {
            status: statusCode,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": getCorsOrigin(),
            },
          }
        ),
      };
    }

    return createErrorResult(statusCode, message);
  }

  // Extract toolNameMap for response translation (Claude OAuth)
  const translatedToolNameMap = translatedBody._toolNameMap;
  const nativeClaudeToolNameMap = isClaudePassthrough
    ? buildClaudePassthroughToolNameMap(body)
    : null;
  const toolNameMap =
    translatedToolNameMap instanceof Map && translatedToolNameMap.size > 0
      ? translatedToolNameMap
      : nativeClaudeToolNameMap;
  delete translatedBody._toolNameMap;
  delete translatedBody._disableToolPrefix;

  // Update model in body — use resolved alias so the provider gets the correct model ID (#472)
  translatedBody.model = effectiveModel;

  // Strip unsupported parameters for reasoning models (o1, o3, etc.)
  const unsupported = getUnsupportedParams(provider, model);
  if (unsupported.length > 0) {
    const stripped: string[] = [];
    for (const param of unsupported) {
      if (Object.hasOwn(translatedBody, param)) {
        stripped.push(param);
        delete translatedBody[param];
      }
    }
    if (stripped.length > 0) {
      log?.warn?.("PARAMS", `Stripped unsupported params for ${model}: ${stripped.join(", ")}`);
    }
  }

  // Provider-specific max_tokens caps (#711)
  // Some providers reject requests when max_tokens exceeds their API limit.
  // Cap before sending to avoid upstream HTTP 400 errors.
  const providerCap = getProviderMaxTokensCap(provider, String(translatedBody.model || ""));
  if (providerCap) {
    for (const field of ["max_tokens", "max_completion_tokens"] as const) {
      if (typeof translatedBody[field] === "number" && translatedBody[field] > providerCap) {
        log?.debug?.(
          "PARAMS",
          `Capping ${field} from ${translatedBody[field]} to ${providerCap} for ${provider} (${String(translatedBody.model || "")})`
        );
        translatedBody[field] = providerCap;
      }
    }
  }

  if (provider === "github") {
    const optimization = optimizeGithubRequestBody(
      translatedBody,
      String(translatedBody.model || model || "")
    );
    if (optimization.actions.length > 0) {
      log?.info?.(
        "GITHUB",
        `Applied request optimizations: ${optimization.actions.join(", ")} (model=${String(translatedBody.model || model || "unknown")}, tools=${Array.isArray(translatedBody.tools) ? translatedBody.tools.length : 0})`
      );
    }
  }

  // Resolve executor with optional upstream proxy (CLIProxyAPI) routing.
  // mode="native" (default): returns the native executor unchanged.
  // mode="cliproxyapi": returns the CLIProxyAPI executor instead.
  // mode="fallback": returns a wrapper that tries native first, falls back to CLIProxyAPI on 5xx/network errors.

  const resolveExecutorWithProxy = async (prov: string) => {
    const cfg = await getUpstreamProxyConfigCached(prov);
    if (!cfg.enabled || cfg.mode === "native") return getExecutor(prov);

    if (cfg.mode === "cliproxyapi") {
      log?.info?.("UPSTREAM_PROXY", `${prov} routed through CLIProxyAPI (passthrough)`);
      return getExecutor("cliproxyapi");
    }

    // mode === "fallback": try native first, retry via CLIProxyAPI on specific failures
    const nativeExec = getExecutor(prov);
    const proxyExec = getExecutor("cliproxyapi");
    const isRetryableStatus = (s: number) => s >= 500 || s === 429 || s === 0;

    const wrapper = Object.create(nativeExec);
    wrapper.execute = async (input: {
      model: string;
      body: unknown;
      stream: boolean;
      credentials: unknown;
      signal?: AbortSignal | null;
      log?: unknown;
      upstreamExtraHeaders?: Record<string, string> | null;
    }) => {
      try {
        const result = await nativeExec.execute(input);
        if (isRetryableStatus(result.response.status)) {
          log?.info?.(
            "UPSTREAM_PROXY",
            `${prov} native failed (${result.response.status}), retrying via CLIProxyAPI`
          );
          try {
            return await proxyExec.execute(input);
          } catch (proxyErr) {
            const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
            log?.error?.("UPSTREAM_PROXY", `${prov} CLIProxyAPI fallback also failed: ${proxyMsg}`);
            throw proxyErr;
          }
        }
        return result;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log?.info?.("UPSTREAM_PROXY", `${prov} native error (${errMsg}), retrying via CLIProxyAPI`);
        try {
          return await proxyExec.execute(input);
        } catch (proxyErr) {
          const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
          log?.error?.("UPSTREAM_PROXY", `${prov} CLIProxyAPI fallback also failed: ${proxyMsg}`);
          throw proxyErr;
        }
      }
    };
    return wrapper;
  };

  // Get executor for this provider (with optional upstream proxy routing)
  const executor = await resolveExecutorWithProxy(provider);
  const getExecutionCredentials = () => {
    const nextCredentials = nativeCodexPassthrough
      ? { ...credentials, requestEndpointPath: endpointPath }
      : credentials;

    if (!ccSessionId) return nextCredentials;

    return {
      ...nextCredentials,
      providerSpecificData: {
        ...(nextCredentials?.providerSpecificData || {}),
        ccSessionId,
      },
    };
  };

  // Create stream controller for disconnect detection
  const streamController = createStreamController({ onDisconnect, log, provider, model });

  const dedupRequestBody = { ...translatedBody, model: `${provider}/${model}`, stream };
  const dedupEnabled = shouldDeduplicate(dedupRequestBody);
  const dedupHash = dedupEnabled ? computeRequestHash(dedupRequestBody) : null;

  const executeProviderRequest = async (modelToCall = effectiveModel, allowDedup = false) => {
    const execute = async () => {
      let bodyToSend =
        translatedBody.model === modelToCall
          ? translatedBody
          : { ...translatedBody, model: modelToCall };

      // Inject prompt_cache_key only for providers that support it
      if (
        targetFormat === FORMATS.OPENAI &&
        providerSupportsCaching(provider) &&
        !bodyToSend.prompt_cache_key &&
        Array.isArray(bodyToSend.messages) &&
        !["nvidia", "codex", "xai"].includes(provider)
      ) {
        const { generatePromptCacheKey } = await import("@/lib/promptCache");
        const cacheKey = generatePromptCacheKey(bodyToSend.messages);
        if (cacheKey) {
          bodyToSend = { ...bodyToSend, prompt_cache_key: cacheKey };
        }
      }

      const rawResult = await withRateLimit(provider, connectionId, modelToCall, async () => {
        let attempts = 0;
        const maxAttempts = provider === "qwen" ? 3 : 1;

        while (attempts < maxAttempts) {
          const res = await executor.execute({
            model: modelToCall,
            body: bodyToSend,
            stream: upstreamStream,
            credentials: getExecutionCredentials(),
            signal: streamController.signal,
            log,
            extendedContext,
            upstreamExtraHeaders: buildUpstreamHeadersForExecute(modelToCall),
          });

          // Qwen 429 strict quota backoff (wait 1.5s, 3s and retry)
          if (provider === "qwen" && res.response.status === 429 && attempts < maxAttempts - 1) {
            const bodyPeek = await res.response
              .clone()
              .text()
              .catch(() => "");
            if (bodyPeek.toLowerCase().includes("exceeded your current quota")) {
              const delay = 1500 * (attempts + 1);
              log?.warn?.("QWEN_RETRY", `Quota 429 hit. Retrying in ${delay}ms...`);
              await new Promise((r) => setTimeout(r, delay));
              attempts++;
              continue;
            }
          }
          return res;
        }
      });

      if (stream) return rawResult;

      // Non-stream responses need cloning for shared dedup consumers.
      const status = rawResult.response.status;
      const statusText = rawResult.response.statusText;
      const headers = Array.from(rawResult.response.headers.entries()) as [string, string][];
      const payload = await rawResult.response.text();

      return {
        ...rawResult,
        response: new Response(payload, { status, statusText, headers }),
      };
    };

    if (allowDedup && dedupEnabled && dedupHash) {
      const dedupResult = await deduplicate(dedupHash, execute);
      if (dedupResult.wasDeduplicated) {
        log?.debug?.("DEDUP", `Joined in-flight request hash=${dedupHash}`);
      }
      return dedupResult.result;
    }

    return execute();
  };

  // Track pending request
  trackPendingRequest(model, provider, connectionId, true);

  // T5: track which models we've tried for intra-family fallback
  const triedModels = new Set<string>([effectiveModel]);
  let currentModel = effectiveModel;

  // Log start
  appendRequestLog({ model, provider, connectionId, status: "PENDING" }).catch(() => {});

  const msgCount =
    translatedBody.messages?.length ||
    translatedBody.contents?.length ||
    translatedBody.request?.contents?.length ||
    0;
  log?.debug?.("REQUEST", `${provider.toUpperCase()} | ${model} | ${msgCount} msgs`);

  // Execute request using executor (handles URL building, headers, fallback, transform)
  let providerResponse;
  let providerUrl;
  let providerHeaders;
  let finalBody;
  let claudePromptCacheLogMeta = null;

  try {
    const result = await executeProviderRequest(effectiveModel, true);

    providerResponse = result.response;
    providerUrl = result.url;
    providerHeaders = result.headers;
    finalBody = result.transformedBody;
    claudePromptCacheLogMeta = buildClaudePromptCacheLogMeta(
      targetFormat,
      finalBody,
      providerHeaders
    );

    // Log target request (final request to provider)
    reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);

    // Update rate limiter from response headers (learn limits dynamically)
    updateFromHeaders(
      provider,
      connectionId,
      providerResponse.headers,
      providerResponse.status,
      model
    );
  } catch (error) {
    trackPendingRequest(model, provider, connectionId, false);
    const failureStatus = error.name === "AbortError" ? 499 : HTTP_STATUS.BAD_GATEWAY;
    const failureMessage =
      error.name === "AbortError"
        ? "Request aborted"
        : formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    appendRequestLog({
      model,
      provider,
      connectionId,
      status: `FAILED ${failureStatus}`,
    }).catch(() => {});
    persistAttemptLogs({
      status: failureStatus,
      error: failureMessage,
      providerRequest: finalBody || translatedBody,
      clientResponse: buildErrorBody(failureStatus, failureMessage),
      claudeCacheMeta: claudePromptCacheLogMeta,
    });
    if (error.name === "AbortError") {
      streamController.handleError(error);
      return createErrorResult(499, "Request aborted");
    }
    persistFailureUsage(
      HTTP_STATUS.BAD_GATEWAY,
      error instanceof Error && error.name ? error.name : "upstream_error"
    );
    console.log(`${COLORS.red}[ERROR] ${failureMessage}${COLORS.reset}`);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, failureMessage);
  }
  // We need to peek at the error text if it's 400 for Qwen
  let upstreamErrorParsed = false;
  let parsedStatusCode = providerResponse.status;
  let parsedMessage = "";
  let parsedRetryAfterMs: number | null = null;
  let upstreamErrorBody: unknown = null;

  if (provider === "qwen" && providerResponse.status === HTTP_STATUS.BAD_REQUEST) {
    const errorDetails = await parseUpstreamError(providerResponse, provider);
    parsedStatusCode = errorDetails.statusCode;
    parsedMessage = errorDetails.message;
    parsedRetryAfterMs = errorDetails.retryAfterMs;
    upstreamErrorBody = errorDetails.responseBody;
    upstreamErrorParsed = true;
  }

  const isQwenExpiredError =
    provider === "qwen" &&
    parsedStatusCode === HTTP_STATUS.BAD_REQUEST &&
    parsedMessage &&
    parsedMessage.toLowerCase().includes("session has expired");

  const streamOptionsOnlyFailed = false; // TODO: properly track stream options failure? (placeholder from existing logic)

  // Handle 401/403 (and Qwen explicit expiration) — OAuth refresh only when a refresh token exists.
  // API-key-only providers (e.g. openrouter) never refresh here; avoids 3× useless retries + misleading logs.
  const canOAuthRefresh = credentials?.refreshToken && typeof credentials.refreshToken === "string";

  if (
    (providerResponse.status === HTTP_STATUS.UNAUTHORIZED ||
      providerResponse.status === HTTP_STATUS.FORBIDDEN ||
      isQwenExpiredError) &&
    !streamOptionsOnlyFailed && // Keep constraint if stream options failed originally
    canOAuthRefresh
  ) {
    const newCredentials = (await refreshWithRetry(
      () => executor.refreshCredentials(credentials, log),
      3,
      log,
      provider
    )) as null | {
      accessToken?: string;
      copilotToken?: string;
    };

    if (newCredentials?.accessToken || newCredentials?.copilotToken) {
      log?.info?.("TOKEN", `${provider.toUpperCase()} | refreshed`);

      // Update credentials
      Object.assign(credentials, newCredentials);

      // Notify caller about refreshed credentials
      if (onCredentialsRefreshed && newCredentials) {
        await onCredentialsRefreshed(newCredentials);
      }

      // Retry with new credentials — model + extra headers follow translatedBody.model so they
      // stay aligned if this block ever runs after a path that mutates body.model (e.g. fallback).
      try {
        const retryModelId = String(translatedBody.model || effectiveModel);
        const retryResult = await executor.execute({
          model: retryModelId,
          body: translatedBody,
          stream: upstreamStream,
          credentials: getExecutionCredentials(),
          signal: streamController.signal,
          log,
          extendedContext,
          upstreamExtraHeaders: buildUpstreamHeadersForExecute(retryModelId),
        });

        if (retryResult.response.ok) {
          providerResponse = retryResult.response;
          providerUrl = retryResult.url;
          providerHeaders = retryResult.headers;
          finalBody = retryResult.transformedBody;
          reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
          upstreamErrorParsed = false; // Reset since new response is OK
        } else {
          providerResponse = retryResult.response;
          upstreamErrorParsed = false; // Let it be parsed downstream
        }
      } catch {
        log?.warn?.("TOKEN", `${provider.toUpperCase()} | retry after refresh failed`);
      }
    } else {
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh failed`);
    }
  }

  // Check provider response - return error info for fallback handling
  if (!providerResponse.ok) {
    trackPendingRequest(model, provider, connectionId, false);

    let statusCode = providerResponse.status;
    let message = "";
    let retryAfterMs: number | null = null;

    if (upstreamErrorParsed) {
      statusCode = parsedStatusCode;
      message = parsedMessage;
      retryAfterMs = parsedRetryAfterMs;
    } else {
      const details = await parseUpstreamError(providerResponse, provider);
      statusCode = details.statusCode;
      message = details.message;
      retryAfterMs = details.retryAfterMs;
      upstreamErrorBody = details.responseBody;
    }

    // T06/T10/T36: classify provider errors and persist terminal account states.
    const errorType = classifyProviderError(statusCode, message);
    if (connectionId && errorType) {
      try {
        if (errorType === PROVIDER_ERROR_TYPES.FORBIDDEN) {
          await updateProviderConnection(connectionId, {
            isActive: false,
            testStatus: "banned",
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId} banned (${statusCode}) — disabling permanently`
          );
        } else if (errorType === PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED) {
          await updateProviderConnection(connectionId, {
            isActive: false,
            testStatus: "deactivated",
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId} account deactivated (${statusCode}) — disabling permanently`
          );
        } else if (errorType === PROVIDER_ERROR_TYPES.RATE_LIMITED) {
          // For providers with per-model quotas (passthrough providers, Gemini),
          // each model has independent quota. A 429 on one model must NOT lock out
          // the entire connection — other models may still have quota available.
          if (
            lockModelIfPerModelQuota(
              provider,
              connectionId,
              model,
              "rate_limited",
              retryAfterMs || COOLDOWN_MS.rateLimit
            )
          ) {
            console.warn(
              `[provider] Node ${connectionId} model-only rate limited (${statusCode}) for ${model} - ${Math.ceil((retryAfterMs || COOLDOWN_MS.rateLimit) / 1000)}s (connection stays active)`
            );
          } else {
            const rateLimitedUntil = new Date(Date.now() + retryAfterMs).toISOString();
            await updateProviderConnection(connectionId, {
              rateLimitedUntil: rateLimitedUntil,
              testStatus: "credits_exhausted",
              lastErrorType: errorType,
              lastError: message,
              errorCode: statusCode,
              healthCheckInterval: null,
              lastHealthCheckAt: null,
            });
            console.warn(
              `[provider] Node ${connectionId} rate limited (${statusCode}) - Next available at ${rateLimitedUntil}`
            );
          }
        } else if (errorType === PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED) {
          // Providers with per-model quotas — lock the model only, not the connection
          if (
            lockModelIfPerModelQuota(
              provider,
              connectionId,
              model,
              "quota_exhausted",
              retryAfterMs || COOLDOWN_MS.rateLimit
            )
          ) {
            console.warn(
              `[provider] Node ${connectionId} model-only quota exhausted (${statusCode}) for ${model} - ${Math.ceil((retryAfterMs || COOLDOWN_MS.rateLimit) / 1000)}s (connection stays active)`
            );
          } else {
            await updateProviderConnection(connectionId, {
              testStatus: "credits_exhausted",
              lastErrorType: errorType,
              lastError: message,
              errorCode: statusCode,
            });
            console.warn(`[provider] Node ${connectionId} exhausted quota (${statusCode})`);
          }
        } else if (errorType === PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED) {
          await updateProviderConnection(connectionId, {
            isActive: false,
            testStatus: "expired",
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId} account deactivated (${statusCode}) — marked expired`
          );
        } else if (errorType === PROVIDER_ERROR_TYPES.UNAUTHORIZED) {
          // Normal 401 (token/session auth issue): keep account active for refresh/re-auth.
          await updateProviderConnection(connectionId, {
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
        } else if (errorType === PROVIDER_ERROR_TYPES.OAUTH_INVALID_TOKEN) {
          // OAuth 401 with invalid credentials - token refresh can recover
          await updateProviderConnection(connectionId, {
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId} OAuth token invalid (${statusCode}) — token refresh available`
          );
        } else if (errorType === PROVIDER_ERROR_TYPES.PROJECT_ROUTE_ERROR) {
          // Cloud Code 403 with stale project: not a ban, keep account active.
          await updateProviderConnection(connectionId, {
            lastErrorType: errorType,
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId} project routing error (${statusCode}) — not banning`
          );
        }
      } catch {
        // Best-effort state update; request flow should continue with fallback handling.
      }
    }

    appendRequestLog({ model, provider, connectionId, status: `FAILED ${statusCode}` }).catch(
      () => {}
    );

    const errMsg = formatProviderError(new Error(message), provider, model, statusCode);
    console.log(`${COLORS.red}[ERROR] ${errMsg}${COLORS.reset}`);

    if (provider === "github" && statusCode === HTTP_STATUS.BAD_REQUEST && message) {
      log?.warn?.(
        "GITHUB",
        `chat/completions 400 — ${message}${upstreamErrorBody != null ? ` | response=${JSON.stringify(upstreamErrorBody).slice(0, 800)}` : ""}`
      );
    }

    if (provider === "kiro" && statusCode === HTTP_STATUS.BAD_REQUEST) {
      log?.warn?.(
        "KIRO",
        `400 malformed — ${message}${upstreamErrorBody != null ? ` | response=${JSON.stringify(upstreamErrorBody).slice(0, 800)}` : ""}`
      );
    }

    // Log Antigravity retry time if available
    if (retryAfterMs && provider === "antigravity") {
      const retrySeconds = Math.ceil(retryAfterMs / 1000);
      log?.debug?.("RETRY", `Antigravity quota reset in ${retrySeconds}s (${retryAfterMs}ms)`);
    }

    // Log error with full request body for debugging
    reqLogger.logError(new Error(message), finalBody || translatedBody);
    reqLogger.logProviderResponse(
      providerResponse.status,
      providerResponse.statusText,
      providerResponse.headers,
      upstreamErrorBody
    );

    // Update rate limiter from error response headers
    updateFromHeaders(provider, connectionId, providerResponse.headers, statusCode, model);

    // ── T5: Intra-family model fallback ──────────────────────────────────────
    // Before returning a model-unavailable error upstream, try sibling models
    // from the same family. This keeps the request alive on the same account
    // instead of failing the entire combo.
    const fallbackResult = handleModelFallback({
      statusCode,
      message,
      currentModel,
      triedModels,
      log,
    });

    if (fallbackResult.attempted && fallbackResult.nextModel) {
      currentModel = fallbackResult.nextModel;
      translatedBody.model = fallbackResult.nextModel;
      const errorCode = fallbackResult.nextModel.includes("overflow")
        ? "context_overflow"
        : "model_unavailable";

      // Re-execute with the fallback model
      try {
        const fallbackExecResult = await executeProviderRequest(fallbackResult.nextModel, false);
        if (fallbackExecResult.response.ok) {
          providerResponse = fallbackExecResult.response;
          providerUrl = fallbackExecResult.url;
          providerHeaders = fallbackExecResult.headers;
          finalBody = fallbackExecResult.transformedBody;
          reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
          log?.info?.(
            errorCode === "context_overflow" ? "CONTEXT_OVERFLOW_FALLBACK" : "MODEL_FALLBACK",
            `Serving ${fallbackResult.nextModel} as fallback for ${model}`
          );
          // Continue processing with the fallback response — skip error return
        } else {
          // Fallback also failed — return original error
          persistAttemptLogs({
            status: statusCode,
            error: errMsg,
            providerRequest: finalBody || translatedBody,
            providerResponse: upstreamErrorBody,
            clientResponse: buildErrorBody(statusCode, errMsg),
          });
          persistFailureUsage(statusCode, errorCode);
          return createErrorResult(statusCode, errMsg, retryAfterMs);
        }
      } catch {
        persistAttemptLogs({
          status: statusCode,
          error: errMsg,
          providerRequest: finalBody || translatedBody,
          providerResponse: upstreamErrorBody,
          clientResponse: buildErrorBody(statusCode, errMsg),
        });
        persistFailureUsage(statusCode, errorCode);
        return createErrorResult(statusCode, errMsg, retryAfterMs);
      }
    } else if (fallbackResult.error) {
      // No fallback available or not a fallback-eligible error
      const errorCode = shouldAttemptModelFallback(statusCode, message)
        ? message.toLowerCase().includes("context")
          ? "context_overflow"
          : "model_unavailable"
        : `upstream_${statusCode}`;
      persistAttemptLogs({
        status: statusCode,
        error: errMsg,
        providerRequest: finalBody || translatedBody,
        providerResponse: upstreamErrorBody,
        clientResponse: buildErrorBody(statusCode, errMsg),
      });
      persistFailureUsage(statusCode, errorCode);
      return createErrorResult(statusCode, errMsg, retryAfterMs);
    } else {
      // Not a fallback-eligible error
      persistAttemptLogs({
        status: statusCode,
        error: errMsg,
        providerRequest: finalBody || translatedBody,
        providerResponse: upstreamErrorBody,
        clientResponse: buildErrorBody(statusCode, errMsg),
      });
      persistFailureUsage(statusCode, `upstream_${statusCode}`);
      return createErrorResult(statusCode, errMsg, retryAfterMs);
    }
    // ── End T5 ───────────────────────────────────────────────────────────────

    // ── Emergency Fallback (ClawRouter Feature #09/017) ────────────────────
    const requestHasTools = Array.isArray(translatedBody.tools) && translatedBody.tools.length > 0;
    const emergencyFallbackResult = await handleEmergencyFallback({
      statusCode,
      message,
      stream,
      requestHasTools,
      provider,
      translatedBody,
      credentials,
      streamController,
      extendedContext,
      log,
    });

    if (emergencyFallbackResult.success) {
      providerResponse = emergencyFallbackResult.response!;
      providerUrl = emergencyFallbackResult.url!;
      providerHeaders = emergencyFallbackResult.headers!;
      finalBody = emergencyFallbackResult.transformedBody!;
      reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
    }
    // ── End Emergency Fallback ────────────────────────────────────────────
  }

  // Non-streaming response
  if (!stream) {
    trackPendingRequest(model, provider, connectionId, false);
    const contentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
    let responseBody;
    const rawBody = await providerResponse.text();
    const normalizedProviderPayload = normalizePayloadForLog(rawBody);
    const looksLikeSSE =
      contentType.includes("text/event-stream") || /(^|\n)\s*(event|data):/m.test(rawBody);

    if (looksLikeSSE) {
      // Upstream returned SSE even though stream=false; convert best-effort to JSON.
      const parsedFromSSE =
        targetFormat === FORMATS.OPENAI_RESPONSES
          ? parseSSEToResponsesOutput(rawBody, model)
          : targetFormat === FORMATS.CLAUDE
            ? parseSSEToClaudeResponse(rawBody, model)
            : parseSSEToOpenAIResponse(rawBody, model);

      if (!parsedFromSSE) {
        appendRequestLog({
          model,
          provider,
          connectionId,
          status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}`,
        }).catch(() => {});
        const invalidSseMessage = "Invalid SSE response for non-streaming request";
        persistAttemptLogs({
          status: HTTP_STATUS.BAD_GATEWAY,
          error: invalidSseMessage,
          providerRequest: finalBody || translatedBody,
          providerResponse: normalizedProviderPayload,
          clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidSseMessage),
        });
        persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_sse_payload");
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidSseMessage);
      }

      responseBody = parsedFromSSE;
    } else {
      const looksLikeHtml =
        contentType.includes("text/html") || /^\s*<(?:!doctype html|html|body)\b/i.test(rawBody);
      if (looksLikeHtml) {
        appendRequestLog({
          model,
          provider,
          connectionId,
          status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}`,
        }).catch(() => {});
        const htmlErrorMessage = "Provider returned HTML error page";
        persistAttemptLogs({
          status: HTTP_STATUS.BAD_GATEWAY,
          error: htmlErrorMessage,
          providerRequest: finalBody || translatedBody,
          providerResponse: normalizedProviderPayload,
          clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage),
        });
        persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "html_error_payload");
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage);
      }

      try {
        responseBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        appendRequestLog({
          model,
          provider,
          connectionId,
          status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}`,
        }).catch(() => {});
        const invalidJsonMessage = rawBody.trim() || "Invalid JSON response from provider";
        persistAttemptLogs({
          status: HTTP_STATUS.BAD_GATEWAY,
          error: invalidJsonMessage,
          providerRequest: finalBody || translatedBody,
          providerResponse: normalizedProviderPayload,
          clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage),
        });
        persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_json_payload");
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage);
      }
    }

    // Check for empty content response (fake success) - trigger fallback
    if (isEmptyContentResponse(responseBody)) {
      appendRequestLog({
        model,
        provider,
        connectionId,
        status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}`,
      }).catch(() => {});
      const emptyContentMessage = "Provider returned empty content";
      persistAttemptLogs({
        status: HTTP_STATUS.BAD_GATEWAY,
        error: emptyContentMessage,
        providerRequest: finalBody || translatedBody,
        providerResponse: normalizedProviderPayload,
        clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, emptyContentMessage),
      });
      persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content");

      // Trigger non-recursive fallback for empty content
      const nextModel = getNextFamilyFallback(currentModel, triedModels);
      if (nextModel) {
        triedModels.add(nextModel);
        currentModel = nextModel;
        translatedBody.model = nextModel;
        log?.info?.(
          "EMPTY_CONTENT_FALLBACK",
          `${model} returned empty content → trying ${nextModel}`
        );
        try {
          const fallbackResult = await executeProviderRequest(nextModel, false);
          if (fallbackResult.response.ok) {
            const fallbackRaw = await fallbackResult.response.text();
            const fallbackContentType = (
              fallbackResult.response.headers.get("content-type") || ""
            ).toLowerCase();
            const fallbackNormalizedProviderPayload = normalizePayloadForLog(fallbackRaw);
            const fallbackLooksLikeHtml =
              fallbackContentType.includes("text/html") ||
              /^\s*<(?:!doctype html|html|body)\b/i.test(fallbackRaw);
            if (fallbackLooksLikeHtml) {
              const htmlErrorMessage = "Provider returned HTML error page";
              persistAttemptLogs({
                status: HTTP_STATUS.BAD_GATEWAY,
                error: htmlErrorMessage,
                providerRequest: fallbackResult.transformedBody || translatedBody,
                providerResponse: fallbackNormalizedProviderPayload,
                clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage),
              });
              persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "html_error_payload");
              return createErrorResult(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage);
            }
            try {
              responseBody = fallbackRaw ? JSON.parse(fallbackRaw) : {};
              providerUrl = fallbackResult.url;
              providerHeaders = fallbackResult.headers;
              finalBody = fallbackResult.transformedBody;
              reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
              log?.info?.(
                "EMPTY_CONTENT_FALLBACK",
                `Serving ${nextModel} as fallback for ${model}`
              );
              // Fall through — continue processing with the new responseBody
            } catch {
              const invalidJsonMessage =
                fallbackRaw.trim() || "Invalid JSON response from provider";
              persistAttemptLogs({
                status: HTTP_STATUS.BAD_GATEWAY,
                error: invalidJsonMessage,
                providerRequest: fallbackResult.transformedBody || translatedBody,
                providerResponse: fallbackNormalizedProviderPayload,
                clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage),
              });
              persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_json_payload");
              return createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage);
            }
          } else {
            const fallbackStatusMessage = `Fallback provider returned ${fallbackResult.response.status}`;
            persistAttemptLogs({
              status: HTTP_STATUS.BAD_GATEWAY,
              error: fallbackStatusMessage,
              providerRequest: fallbackResult.transformedBody || translatedBody,
              clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, fallbackStatusMessage),
            });
            persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_fallback_failed");
            return createErrorResult(HTTP_STATUS.BAD_GATEWAY, fallbackStatusMessage);
          }
        } catch {
          const fallbackExecutionMessage = "Fallback provider request failed after empty content";
          persistAttemptLogs({
            status: HTTP_STATUS.BAD_GATEWAY,
            error: fallbackExecutionMessage,
            providerRequest: finalBody || translatedBody,
            clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, fallbackExecutionMessage),
          });
          persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_fallback_request_failed");
          return createErrorResult(HTTP_STATUS.BAD_GATEWAY, fallbackExecutionMessage);
        }
      } else {
        const noFallbackMessage =
          "Provider returned empty content and no fallback model was available";
        persistAttemptLogs({
          status: HTTP_STATUS.BAD_GATEWAY,
          error: noFallbackMessage,
          providerRequest: finalBody || translatedBody,
          providerResponse: normalizedProviderPayload,
          clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, noFallbackMessage),
        });
        persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_no_fallback");
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, noFallbackMessage);
      }
    }

    if (sourceFormat === FORMATS.CLAUDE && targetFormat === FORMATS.CLAUDE) {
      responseBody = restoreClaudePassthroughToolNames(responseBody, toolNameMap);
    }

    await persistCodexQuotaState({
      provider,
      connectionId,
      credentials,
      model: currentModel || String(translatedBody.model || model),
      requestedModel,
      headers: providerResponse.headers,
      status: providerResponse.status,
      log,
    });

    reqLogger.logProviderResponse(
      providerResponse.status,
      providerResponse.statusText,
      providerResponse.headers,
      looksLikeSSE
        ? {
            _streamed: true,
            _format: "sse-json",
            summary: responseBody,
          }
        : responseBody
    );

    // Notify success - caller can clear error status if needed
    if (onRequestSuccess) {
      await onRequestSuccess();
    }

    // Log usage for non-streaming responses
    const usage = extractUsageFromResponse(responseBody, provider);
    appendRequestLog({ model, provider, connectionId, tokens: usage, status: "200 OK" }).catch(
      () => {}
    );

    // Save structured call log with full payloads
    const cacheUsageLogMeta = buildCacheUsageLogMeta(usage);
    if (usage && typeof usage === "object") {
      const msg = `[${new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}] 📊 [USAGE] ${provider.toUpperCase()} | ${formatUsageLog(usage)}${connectionId ? ` | account=${connectionId.slice(0, 8)}...` : ""}`;
      console.log(`${COLORS.green}${msg}${COLORS.reset}`);

      // Track cache token metrics
      const _inputTokens = usage.prompt_tokens || 0;
      const _cachedTokens = toPositiveNumber(
        usage.cache_read_input_tokens ??
          usage.cached_tokens ??
          (
            (usage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cached_tokens
      );
      const _cacheCreationTokens = toPositiveNumber(
        usage.cache_creation_input_tokens ??
          (
            (usage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cache_creation_tokens
      );

      saveRequestUsage({
        provider: provider || "unknown",
        model: model || "unknown",
        tokens: usage,
        status: "200",
        success: true,
        latencyMs: Date.now() - startTime,
        timeToFirstTokenMs: Date.now() - startTime,
        errorCode: null,
        timestamp: new Date().toISOString(),
        connectionId: connectionId || undefined,
        apiKeyId: apiKeyInfo?.id || undefined,
        apiKeyName: apiKeyInfo?.name || undefined,
      }).catch((err) => {
        console.error("Failed to save usage stats:", err.message);
      });
    }

    if (apiKeyInfo?.id && usage) {
      const estimatedCost = await calculateCost(provider, model, usage);
      if (estimatedCost > 0) recordCost(apiKeyInfo.id, estimatedCost);
    }

    // Translate response to client's expected format (usually OpenAI)
    // Pass toolNameMap so Claude OAuth proxy_ prefix is stripped in tool_use blocks (#605)
    let translatedResponse = needsTranslation(targetFormat, sourceFormat)
      ? translateNonStreamingResponse(
          responseBody,
          targetFormat,
          sourceFormat,
          toolNameMap as Map<string, string> | null
        )
      : responseBody;

    // T26: Strip markdown code blocks if provider format is Claude
    if (sourceFormat === "claude" && !stream) {
      if (typeof translatedResponse?.choices?.[0]?.message?.content === "string") {
        translatedResponse.choices[0].message.content = stripMarkdownCodeFence(
          translatedResponse.choices[0].message.content
        ) as string;
      }
    }

    // T18: Normalize finish_reason to 'tool_calls' if tool calls are present
    if (translatedResponse?.choices) {
      for (const choice of translatedResponse.choices) {
        if (
          choice.message?.tool_calls &&
          choice.message.tool_calls.length > 0 &&
          choice.finish_reason !== "tool_calls"
        ) {
          choice.finish_reason = "tool_calls";
        }
      }
    }

    // Sanitize response for OpenAI SDK compatibility
    // Strips non-standard fields (x_groq, usage_breakdown, etc.) while preserving official ones
    // such as service_tier and system_fingerprint, and extracts <think>/<thinking> tags.
    // Source format determines output shape. If we are outputting OpenAI shape or pseudo-OpenAI shape, sanitize.
    if (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES) {
      translatedResponse = sanitizeOpenAIResponse(translatedResponse);
    }

    // Add buffer and filter usage for client (to prevent CLI context errors)
    if (translatedResponse?.usage) {
      const buffered = addBufferToUsage(translatedResponse.usage);
      translatedResponse.usage = filterUsageForFormat(buffered, sourceFormat);
    } else {
      // Fallback: estimate usage when provider returned no usage block
      const contentLength = JSON.stringify(
        translatedResponse?.choices?.[0]?.message?.content || ""
      ).length;
      if (contentLength > 0) {
        const estimated = estimateUsage(body, contentLength, sourceFormat);
        translatedResponse.usage = filterUsageForFormat(estimated, sourceFormat);
      }
    }

    // ── Phase 9.1: Cache store (non-streaming, temp=0) ──
    if (isCacheable(body, clientRawRequest?.headers)) {
      const signature = generateSignature(model, body.messages, body.temperature, body.top_p);
      const tokensSaved = usage?.prompt_tokens + usage?.completion_tokens || 0;
      setCachedResponse(signature, model, translatedResponse, tokensSaved);
      log?.debug?.("CACHE", `Stored response for ${model} (${tokensSaved} tokens)`);
    }

    // ── Phase 9.2: Save for idempotency ──
    saveIdempotency(idempotencyKey, translatedResponse, 200);
    reqLogger.logConvertedResponse(translatedResponse);
    persistAttemptLogs({
      status: 200,
      tokens: usage,
      responseBody,
      providerRequest: finalBody || translatedBody,
      providerResponse: looksLikeSSE
        ? {
            _streamed: true,
            _format: "sse-json",
            summary: responseBody,
          }
        : responseBody,
      clientResponse: translatedResponse,
      claudeCacheMeta: claudePromptCacheLogMeta,
      claudeCacheUsageMeta: cacheUsageLogMeta,
    });

    return {
      success: true,
      response: new Response(JSON.stringify(translatedResponse), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getCorsOrigin(),
          "X-Routiform-Cache": "MISS",
        },
      }),
    };
  }

  // Streaming response

  // Notify success - caller can clear error status if needed
  if (onRequestSuccess) {
    await onRequestSuccess();
  }

  const responseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": getCorsOrigin(),
  };

  // Create transform stream with logger for streaming response
  let transformStream;

  // Callback to save call log when stream completes (include responseBody when provided by stream)
  const onStreamComplete = ({
    status: streamStatus,
    usage: streamUsage,
    responseBody: streamResponseBody,
    providerPayload,
    clientPayload,
    ttft,
  }) => {
    const cacheUsageLogMeta = buildCacheUsageLogMeta(streamUsage);

    // Track cache token metrics for streaming responses
    if (streamUsage && typeof streamUsage === "object") {
      const _inputTokens = streamUsage.prompt_tokens || 0;
      const _cachedTokens = toPositiveNumber(
        streamUsage.cache_read_input_tokens ??
          streamUsage.cached_tokens ??
          (
            (streamUsage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cached_tokens
      );
      const _cacheCreationTokens = toPositiveNumber(
        streamUsage.cache_creation_input_tokens ??
          (
            (streamUsage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cache_creation_tokens
      );

      saveRequestUsage({
        provider: provider || "unknown",
        model: model || "unknown",
        tokens: streamUsage,
        status: String(streamStatus || 200),
        success: streamStatus === 200,
        latencyMs: Date.now() - startTime,
        timeToFirstTokenMs: ttft,
        errorCode: null,
        timestamp: new Date().toISOString(),
        connectionId: connectionId || undefined,
        apiKeyId: apiKeyInfo?.id || undefined,
        apiKeyName: apiKeyInfo?.name || undefined,
      }).catch((err) => {
        console.error("Failed to save usage stats:", err.message);
      });
    }

    persistAttemptLogs({
      status: streamStatus || 200,
      tokens: streamUsage || {},
      responseBody: streamResponseBody ?? undefined,
      providerRequest: finalBody || translatedBody,
      providerResponse: providerPayload,
      clientResponse: clientPayload ?? streamResponseBody ?? undefined,
      claudeCacheMeta: claudePromptCacheLogMeta,
      claudeCacheUsageMeta: cacheUsageLogMeta,
    });

    if (apiKeyInfo?.id && streamUsage) {
      calculateCost(provider, model, streamUsage)
        .then((estimatedCost) => {
          if (estimatedCost > 0) recordCost(apiKeyInfo.id, estimatedCost);
        })
        .catch(() => {});
    }
  };

  // For providers using Responses API format, translate stream back to openai (Chat Completions) format
  // UNLESS client is Droid CLI which expects openai-responses format back
  const isDroidCLI = isDroidCliUserAgent(userAgent);
  const needsResponsesTranslation =
    targetFormat === FORMATS.OPENAI_RESPONSES &&
    sourceFormat === FORMATS.OPENAI &&
    !isResponsesEndpoint &&
    !isDroidCLI;

  if (needsResponsesTranslation) {
    // Provider returns openai-responses, translate to openai (Chat Completions) that clients expect
    log?.debug?.("STREAM", `Responses translation mode: openai-responses → openai`);
    transformStream = createSSETransformStreamWithLogger(
      "openai-responses",
      "openai",
      provider,
      reqLogger,
      toolNameMap,
      model,
      connectionId,
      body,
      onStreamComplete,
      apiKeyInfo
    );
  } else if (needsTranslation(targetFormat, sourceFormat)) {
    // Standard translation for other providers
    log?.debug?.("STREAM", `Translation mode: ${targetFormat} → ${sourceFormat}`);
    transformStream = createSSETransformStreamWithLogger(
      targetFormat,
      sourceFormat,
      provider,
      reqLogger,
      toolNameMap,
      model,
      connectionId,
      body,
      onStreamComplete,
      apiKeyInfo
    );
  } else {
    log?.debug?.("STREAM", `Standard passthrough mode`);
    transformStream = createPassthroughStreamWithLogger(
      provider,
      reqLogger,
      toolNameMap,
      model,
      connectionId,
      body,
      onStreamComplete,
      apiKeyInfo
    );
  }

  // ── Phase 9.3: Progress tracking (opt-in) ──
  const progressEnabled = wantsProgress(clientRawRequest?.headers);
  let finalStream;
  if (progressEnabled) {
    const progressTransform = createProgressTransform({ signal: streamController.signal });
    // Chain: provider → transform → progress → client
    const transformedBody = pipeWithDisconnect(providerResponse, transformStream, streamController);
    finalStream = transformedBody.pipeThrough(progressTransform);
    responseHeaders["X-Routiform-Progress"] = "enabled";
    responseHeaders["X-Routiform-Progress"] = "enabled";
  } else {
    finalStream = pipeWithDisconnect(providerResponse, transformStream, streamController);
  }

  return {
    success: true,
    response: new Response(finalStream, {
      headers: responseHeaders,
    }),
  };
}

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpiringSoon(expiresAt, bufferMs = 5 * 60 * 1000) {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  return expiresAtMs - Date.now() < bufferMs;
}
