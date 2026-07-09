import { saveRequestUsage } from "@/lib/usageDb";

/** Return shape of handleChatCore / runChatCoreOrchestrator (widened for all branches). */
export type ChatCoreHandlerResult = Record<string, unknown> & {
  success?: boolean;
  response?: Response;
  status?: number;
  error?: string;
  retryAfterMs?: number;
};

/** Arguments for handleChatCore / pipeline (same shape as the public handler). */
export type HandleChatCoreArgs = {
  body: Record<string, unknown>;
  modelInfo: {
    provider: string;
    model: string;
    extendedContext?: boolean;
    sourceFormat?: string;
    targetFormat?: string;
    format?: string;
  };
  requestedModelOverride?: string;
  credentials: Record<string, unknown>;
  log?: unknown;
  onCredentialsRefreshed?: (c: unknown) => Promise<void>;
  onRequestSuccess?: () => Promise<void>;
  onDisconnect?: () => void;
  clientRawRequest?: unknown;
  connectionId?: string;
  apiKeyInfo?: Record<string, unknown> | null;
  userAgent?: string;
  comboName?: string;
  comboStrategy?: string | null;
  isCombo?: boolean;
  combo?: unknown | null;
  sourceFormat?: string;
  targetFormat?: string;
  isResponsesEndpoint?: boolean;
};

/** Mutable pipeline bag passed through chat-core phases (internal refactor). */
export type ChatCorePipeline = HandleChatCoreArgs & {
  requestedModel: string;
  startTime: number;
  provider: string;
  model: string;
  extendedContext: boolean | undefined;
  body: Record<string, unknown>;
  persistFailureUsage: (statusCode: number, errorCode?: string | null) => void;
  idempotencyKey?: string;
  endpointPath?: string;
  sourceFormat?: string;
  isResponsesEndpoint?: boolean;
  nativeCodexPassthrough?: boolean;
  resolvedModel?: string;
  effectiveModel?: string;
  targetFormat?: string;
  noLogEnabled?: boolean;
  detailedLoggingEnabled?: boolean;
  persistAttemptLogs?: (opts: Record<string, unknown>) => void;
  connectionCustomUserAgent?: string;
  buildUpstreamHeadersForExecute?: (modelId: string) => unknown;
  acceptHeader?: string;
  explicitStreamAlias?: unknown;
  stream?: boolean;
  reqLogger?: unknown;
  isClaudePassthrough?: boolean;
  isClaudeCodeCompatible?: boolean;
  upstreamStream?: boolean;
  translatedBody?: Record<string, unknown>;
  /** Applied compression plan echo (e.g. for X-Routiform-Compression). */
  compressionHeader?: string;
  ccSessionId?: string;
  toolNameMap?: unknown;
  executor?: unknown;
  getExecutionCredentials?: () => unknown;
  streamController?: { signal: AbortSignal; handleError: (e: unknown) => void };
  executeProviderRequest?: (
    modelId: string,
    track: boolean
  ) => Promise<{
    response: Response;
    url: string;
    headers: Headers;
    transformedBody: unknown;
  }>;
  triedModels?: Set<string>;
  currentModel?: string;
  providerResponse?: Response;
  providerUrl?: string;
  providerHeaders?: Headers;
  finalBody?: unknown;
  claudePromptCacheLogMeta?: unknown;
  upstreamErrorParsed?: boolean;
  parsedStatusCode?: number;
  parsedMessage?: string;
  parsedRetryAfterMs?: number | null;
  upstreamErrorBody?: unknown;
  streamOptionsOnlyFailed?: boolean;
  /** Parsed JSON / SSE object for non-streaming success path (set by non-stream phase A). */
  nonStreamResponseBody?: unknown;
  nonStreamLooksLikeSse?: boolean;
};

export function initChatCorePipeline(args: HandleChatCoreArgs): ChatCorePipeline {
  const { modelInfo, body, credentials, requestedModelOverride, ...rest } = args;
  const requestedModel =
    typeof requestedModelOverride === "string" && requestedModelOverride.trim().length > 0
      ? requestedModelOverride
      : typeof body?.model === "string" && body.model.trim().length > 0
        ? body.model
        : modelInfo.model;
  const startTime = Date.now();
  const persistFailureUsage = (statusCode: number, errorCode?: string | null) => {
    saveRequestUsage({
      provider: modelInfo.provider || "unknown",
      model: modelInfo.model || "unknown",
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0 },
      status: String(statusCode),
      success: false,
      latencyMs: Date.now() - startTime,
      timeToFirstTokenMs: 0,
      errorCode: errorCode || String(statusCode),
      timestamp: new Date().toISOString(),
      connectionId: rest.connectionId || undefined,
      apiKeyId: (rest.apiKeyInfo as { id?: string } | null)?.id || undefined,
      apiKeyName: (rest.apiKeyInfo as { name?: string } | null)?.name || undefined,
    }).catch(() => {});
  };
  return {
    ...rest,
    body,
    credentials,
    modelInfo,
    provider: modelInfo.provider,
    model: modelInfo.model,
    extendedContext: modelInfo.extendedContext,
    requestedModel,
    startTime,
    persistFailureUsage,
  };
}
