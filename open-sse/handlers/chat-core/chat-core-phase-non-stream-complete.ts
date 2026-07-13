import { recordCost } from "@/domain/costRules";
import { saveIdempotency } from "@/lib/idempotencyLayer";
import { calculateCost } from "@/lib/usage/costCalculator";
import { formatUsageLog } from "@/lib/usage/tokenAccounting";
import { appendRequestLog, saveRequestUsage } from "@/lib/usageDb";
import { generateSignature, isCacheable, setCachedResponse } from "@/lib/semanticCache";
import { FORMATS } from "../../translator/formats.ts";
import { getCorsOrigin } from "../../utils/cors.ts";
import { persistCodexQuotaState } from "../services/codex-quota-manager.ts";
import { buildCacheUsageLogMeta } from "../utils/cache-log-helpers.ts";
import { COLORS } from "../../utils/stream.ts";
import { restoreClaudePassthroughToolNames } from "../utils/claude-passthrough-helpers.ts";
import { normalizeNonStreamingTranslatedResponse } from "../utils/non-streaming-response-normalizer.ts";
import { extractUsageFromResponse } from "../usageExtractor.ts";
import { cacheReasoningFromAssistantMessage } from "../../services/reasoningCache.ts";
import { toPositiveNumber } from "./chat-core-flags.ts";
import type { ToolNameMap } from "../types/chat-core.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown };

export async function chatCorePhaseNonStreamComplete(p: ChatCorePipeline): Promise<PhaseOutcome> {
  const log = p.log as { debug?: (t: string, m: string) => void } | undefined;
  const clientRawRequest = p.clientRawRequest as { headers?: unknown } | undefined;
  const apiKeyInfo = p.apiKeyInfo as { id?: string; name?: string } | null;
  const persistAttemptLogs = p.persistAttemptLogs as NonNullable<
    ChatCorePipeline["persistAttemptLogs"]
  >;
  const reqLogger = p.reqLogger as {
    logProviderResponse: (a: number, b: string, c: Headers, d: unknown) => void;
    logConvertedResponse: (r: unknown) => void;
  };
  const translatedBody = p.translatedBody as Record<string, unknown>;
  const providerResponse = p.providerResponse as Response;
  let responseBody = p.nonStreamResponseBody;
  const looksLikeSSE = !!p.nonStreamLooksLikeSse;
  const toolNameMap = p.toolNameMap as ToolNameMap;

  if (p.sourceFormat === FORMATS.CLAUDE && p.targetFormat === FORMATS.CLAUDE) {
    responseBody = restoreClaudePassthroughToolNames(
      responseBody as Record<string, unknown>,
      toolNameMap
    );
  }

  await persistCodexQuotaState({
    provider: p.provider,
    connectionId: p.connectionId,
    credentials: p.credentials,
    model: (p.currentModel as string) || String(translatedBody.model || p.model),
    requestedModel: p.requestedModel,
    headers: providerResponse.headers,
    status: providerResponse.status,
    log,
  });

  reqLogger.logProviderResponse(
    providerResponse.status,
    providerResponse.statusText,
    providerResponse.headers,
    looksLikeSSE ? { _streamed: true, _format: "sse-json", summary: responseBody } : responseBody
  );

  if (p.onRequestSuccess) {
    await p.onRequestSuccess();
  }

  // Pass targetFormat explicitly: it carries per-model overrides the provider-level
  // registry lookup cannot see, and it is what the request was actually built against.
  const usage = extractUsageFromResponse(responseBody, p.provider, p.targetFormat);
  appendRequestLog({
    model: p.model,
    provider: p.provider,
    connectionId: p.connectionId,
    tokens: usage,
    status: "200 OK",
  }).catch(() => {});

  const cacheUsageLogMeta = buildCacheUsageLogMeta(
    usage as Record<string, unknown> | null | undefined
  );
  if (usage && typeof usage === "object") {
    const msg = `[${new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}] 📊 [USAGE] ${p.provider.toUpperCase()} | ${formatUsageLog(usage)}${p.connectionId ? ` | account=${p.connectionId.slice(0, 8)}...` : ""}`;
    console.log(`${COLORS.green}${msg}${COLORS.reset}`);

    const _inputTokens = (usage as { prompt_tokens?: number }).prompt_tokens || 0;
    const _cachedTokens = toPositiveNumber(
      (usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ??
        (usage as { cached_tokens?: number }).cached_tokens ??
        (
          (usage as Record<string, unknown>).prompt_tokens_details as
            | Record<string, unknown>
            | undefined
        )?.cached_tokens
    );
    const _cacheCreationTokens = toPositiveNumber(
      (usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ??
        (
          (usage as Record<string, unknown>).prompt_tokens_details as
            | Record<string, unknown>
            | undefined
        )?.cache_creation_tokens
    );

    saveRequestUsage({
      provider: p.provider || "unknown",
      model: p.model || "unknown",
      tokens: usage,
      status: "200",
      success: true,
      latencyMs: Date.now() - p.startTime,
      timeToFirstTokenMs: Date.now() - p.startTime,
      errorCode: null,
      timestamp: new Date().toISOString(),
      connectionId: p.connectionId || undefined,
      apiKeyId: apiKeyInfo?.id || undefined,
      apiKeyName: apiKeyInfo?.name || undefined,
    }).catch((err: Error) => {
      console.error("Failed to save usage stats:", err.message);
    });
  }

  if (apiKeyInfo?.id && usage) {
    const estimatedCost = await calculateCost(
      p.provider,
      p.model,
      usage as Record<string, unknown>
    );
    if (estimatedCost > 0) recordCost(apiKeyInfo.id, estimatedCost);
  }

  let translatedResponse = normalizeNonStreamingTranslatedResponse({
    requestBody: p.body,
    responseBody,
    sourceFormat: p.sourceFormat || "",
    targetFormat: p.targetFormat || "",
    stream: !!p.stream,
    toolNameMap,
  });

  try {
    const assistantMessage = (translatedResponse as Record<string, unknown>)?.choices?.[0]?.message;
    cacheReasoningFromAssistantMessage(
      assistantMessage as Record<string, unknown>,
      p.provider,
      p.model
    );
  } catch {
    // Reasoning cache capture is best effort only.
  }

  // Key the cache on the pristine pre-compression body (p.rawBody), not the
  // (possibly compression-mutated) p.body — otherwise the stored signature
  // would depend on the requester's compression settings and would never
  // match a future lookup's signature (checkSemanticCache always keys on a
  // freshly parsed, still-pristine body). Falls back to p.body for callers
  // that never went through the translate-and-bundle phase (e.g. tests).
  const cacheKeyBody = (p.rawBody as Record<string, unknown> | undefined) ?? p.body;
  if (isCacheable(cacheKeyBody, clientRawRequest?.headers as Headers | undefined)) {
    const signature = generateSignature(
      p.model,
      cacheKeyBody.messages,
      Number(cacheKeyBody.temperature ?? 0),
      Number(cacheKeyBody.top_p ?? 1)
    );
    const usageRec = usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | null
      | undefined;
    const tokensSaved = (usageRec?.prompt_tokens ?? 0) + (usageRec?.completion_tokens ?? 0) || 0;
    setCachedResponse(signature, p.model, translatedResponse, tokensSaved);
    log?.debug?.("CACHE", `Stored response for ${p.model} (${tokensSaved} tokens)`);
  }

  saveIdempotency(p.idempotencyKey!, translatedResponse, 200);
  reqLogger.logConvertedResponse(translatedResponse);
  persistAttemptLogs({
    status: 200,
    tokens: usage,
    responseBody: translatedResponse,
    providerRequest: p.finalBody || translatedBody,
    providerResponse: looksLikeSSE
      ? { _streamed: true, _format: "sse-json", summary: responseBody }
      : responseBody,
    clientResponse: translatedResponse,
    claudeCacheMeta: p.claudePromptCacheLogMeta as Record<string, unknown> | undefined,
    claudeCacheUsageMeta: cacheUsageLogMeta,
  });

  return {
    done: true,
    result: {
      success: true,
      response: new Response(JSON.stringify(translatedResponse), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getCorsOrigin(),
          "X-Routiform-Cache": "MISS",
        },
      }),
    },
  };
}
