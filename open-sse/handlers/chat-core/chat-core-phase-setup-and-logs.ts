import { isDetailedLoggingEnabled } from "@/lib/db/detailedLogs";
import { getIdempotencyKey } from "@/lib/idempotencyLayer";
import { saveCallLog } from "@/lib/usageDb";
import { generateRequestId } from "@/shared/utils/requestId";
import { PROVIDER_ID_TO_ALIAS, getModelTargetFormat } from "../../config/providerModels.ts";
import { resolveModelAlias } from "../../services/modelDeprecation.ts";
import { detectFormatFromEndpoint, getTargetFormat } from "../../services/provider.ts";
import { initializeRateLimits } from "../../services/rateLimitManager.ts";
import { handleBypassRequest } from "../../utils/bypassHandler.ts";
import { handleBackgroundTaskRedirection } from "../phases/background-task-redirector.ts";
import { handleIdempotencyCheck } from "../phases/idempotency-check.ts";
import type { HandlerLogger } from "../types/chat-core.ts";
import { attachLogMeta } from "../utils/cache-log-helpers.ts";
import { shouldUseNativeCodexPassthrough } from "./chat-core-flags.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown } | { done: false };

export async function chatCorePhaseSetupAndLogs(p: ChatCorePipeline): Promise<PhaseOutcome> {
  const log = p.log as HandlerLogger | null | undefined;
  const clientRawRequest = p.clientRawRequest as
    | { headers?: Record<string, string>; endpoint?: string }
    | undefined;
  const credentials = p.credentials as { connectionId?: string } & Record<string, unknown>;
  const apiKeyInfo = p.apiKeyInfo as { noLog?: boolean; id?: string; name?: string } | null;

  const idempotencyKey = getIdempotencyKey(clientRawRequest?.headers as unknown);
  p.idempotencyKey = idempotencyKey;
  const idempotentResponse = handleIdempotencyCheck(
    clientRawRequest as { headers?: Record<string, string> } | null | undefined,
    log
  );
  if (idempotentResponse) {
    return { done: true, result: { success: true, response: idempotentResponse } };
  }

  await initializeRateLimits();

  if (p.connectionId && credentials && !credentials.connectionId) {
    credentials.connectionId = p.connectionId;
  }

  const endpointPath = String(clientRawRequest?.endpoint || "");
  p.endpointPath = endpointPath;
  const modelInfoFormat =
    p.modelInfo && typeof p.modelInfo === "object" ? p.modelInfo.sourceFormat : undefined;
  const sourceFormat =
    p.sourceFormat ||
    (typeof modelInfoFormat === "string" ? modelInfoFormat : "") ||
    detectFormatFromEndpoint(p.body, endpointPath);
  p.sourceFormat = sourceFormat;
  p.isResponsesEndpoint =
    p.isResponsesEndpoint === true ||
    /\/responses(?=\/|$)/i.test(endpointPath) ||
    /^responses(?=\/|$)/i.test(endpointPath);
  const nativeCodexPassthrough = shouldUseNativeCodexPassthrough({
    provider: p.provider,
    sourceFormat,
    endpointPath,
  });
  p.nativeCodexPassthrough = nativeCodexPassthrough;

  const bypassResponse = handleBypassRequest(p.body, p.model, p.userAgent);
  if (bypassResponse) {
    return { done: true, result: bypassResponse };
  }

  p.model = handleBackgroundTaskRedirection({
    model: p.model,
    body: p.body,
    headers: clientRawRequest?.headers as Record<string, string | string[] | undefined> | undefined,
    apiKeyInfo,
    connectionId: p.connectionId,
    provider: p.provider,
    log,
  });

  const resolvedModel = resolveModelAlias(p.model);
  p.resolvedModel = resolvedModel;
  const effectiveModel = resolvedModel !== p.model ? resolvedModel : p.model;
  p.effectiveModel = effectiveModel;
  if (resolvedModel !== p.model) {
    log?.info?.("ALIAS", `Model alias applied: ${p.model} → ${resolvedModel}`);
  }

  const alias = PROVIDER_ID_TO_ALIAS[p.provider] || p.provider;
  const modelTargetFormat = getModelTargetFormat(alias, resolvedModel);
  const modelInfoTargetFormat =
    p.modelInfo && typeof p.modelInfo === "object" ? p.modelInfo.targetFormat : undefined;
  const modelInfoFormatTarget =
    p.modelInfo && typeof p.modelInfo === "object" ? p.modelInfo.format : undefined;
  const targetFormat =
    p.targetFormat ||
    (typeof modelInfoTargetFormat === "string" ? modelInfoTargetFormat : "") ||
    (typeof modelInfoFormatTarget === "string" ? modelInfoFormatTarget : "") ||
    modelTargetFormat ||
    getTargetFormat(p.provider, credentials?.providerSpecificData, { sourceFormat });
  p.targetFormat = targetFormat;
  const noLogEnabled = apiKeyInfo?.noLog === true;
  p.noLogEnabled = noLogEnabled;
  const detailedLoggingEnabled = !noLogEnabled && (await isDetailedLoggingEnabled());
  p.detailedLoggingEnabled = detailedLoggingEnabled;

  p.persistAttemptLogs = ({
    status,
    tokens,
    responseBody,
    error,
    providerResponse: provResp,
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
    const reqLogger = p.reqLogger as
      | { getPipelinePayloads?: () => Record<string, unknown> }
      | undefined;
    const pipelinePayloads = detailedLoggingEnabled ? reqLogger?.getPipelinePayloads?.() : null;

    if (pipelinePayloads) {
      if (provResp !== undefined) {
        pipelinePayloads.providerResponse = provResp as Record<string, unknown>;
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
      model: p.model,
      requestedModel: p.requestedModel,
      provider: p.provider,
      connectionId: p.connectionId,
      duration: Date.now() - p.startTime,
      tokens: tokens || {},
      requestBody: attachLogMeta((p.body as Record<string, unknown>) ?? undefined, {
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
      comboName: p.comboName,
      apiKeyId: apiKeyInfo?.id || null,
      apiKeyName: apiKeyInfo?.name || null,
      noLog: noLogEnabled,
      pipelinePayloads,
    }).catch(() => {});
  };

  return { done: false };
}
