import { trackPendingRequest } from "@/lib/usageDb";
import { HTTP_STATUS } from "../../config/constants.ts";
import { buildClaudePromptCacheLogMeta } from "../utils/cache-log-helpers.ts";
import { buildErrorBody, createErrorResult, formatProviderError } from "../../utils/error.ts";
import { updateFromHeaders } from "../../services/rateLimitManager.ts";
import { COLORS } from "../../utils/stream.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown } | { done: false };

export async function chatCorePhaseFirstUpstream(p: ChatCorePipeline): Promise<PhaseOutcome> {
  const log = p.log as {
    info?: (t: string, m: string) => void;
    warn?: (t: string, m: string) => void;
    debug?: (t: string, m: string) => void;
  };
  const translatedBody = p.translatedBody as Record<string, unknown>;
  const effectiveModel = p.effectiveModel || "";
  const persistAttemptLogs = p.persistAttemptLogs as NonNullable<
    ChatCorePipeline["persistAttemptLogs"]
  >;
  const executeProviderRequest = p.executeProviderRequest as NonNullable<
    ChatCorePipeline["executeProviderRequest"]
  >;
  const streamController = p.streamController as NonNullable<ChatCorePipeline["streamController"]>;
  const reqLogger = p.reqLogger as {
    logTargetRequest: (u: string, h: Headers, b: unknown) => void;
  };

  trackPendingRequest(p.model, p.provider, p.connectionId, true);

  const triedModels = new Set<string>([effectiveModel]);
  p.triedModels = triedModels;
  let currentModel = effectiveModel;
  p.currentModel = currentModel;

  const messages = translatedBody.messages;
  const contents = translatedBody.contents;
  const reqContents = (translatedBody.request as { contents?: unknown[] } | undefined)?.contents;
  const conversationState = translatedBody.conversationState as
    { history?: unknown[]; currentMessage?: unknown } | undefined;
  const kiroTurnCount =
    conversationState &&
    (Array.isArray(conversationState.history) || conversationState.currentMessage != null)
      ? (Array.isArray(conversationState.history) ? conversationState.history.length : 0) +
        (conversationState.currentMessage != null ? 1 : 0)
      : 0;
  const msgCount =
    (Array.isArray(messages) ? messages.length : 0) ||
    (Array.isArray(contents) ? contents.length : 0) ||
    (Array.isArray(reqContents) ? reqContents.length : 0) ||
    kiroTurnCount ||
    0;
  log?.debug?.("REQUEST", `${p.provider.toUpperCase()} | ${p.model} | ${msgCount} msgs`);

  let providerResponse: Response;
  let providerUrl: string;
  let providerHeaders: Headers;
  let finalBody: unknown;
  let claudePromptCacheLogMeta: unknown = null;

  try {
    const result = await executeProviderRequest(effectiveModel, true);

    providerResponse = result.response;
    providerUrl = result.url;
    providerHeaders = result.headers;
    finalBody = result.transformedBody;
    claudePromptCacheLogMeta = buildClaudePromptCacheLogMeta(
      p.targetFormat || "",
      finalBody as Record<string, unknown> | null | undefined,
      providerHeaders as unknown as Record<string, unknown> | null | undefined
    );

    reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);

    updateFromHeaders(
      p.provider,
      p.connectionId,
      providerResponse.headers,
      providerResponse.status,
      p.model
    );
  } catch (err) {
    const error = err as Error & { name?: string };
    trackPendingRequest(p.model, p.provider, p.connectionId, false);
    const failureStatus = error.name === "AbortError" ? 499 : HTTP_STATUS.BAD_GATEWAY;
    const failureMessage =
      error.name === "AbortError"
        ? "Request aborted"
        : formatProviderError(error, p.provider, p.model, HTTP_STATUS.BAD_GATEWAY);
    persistAttemptLogs({
      status: failureStatus,
      error: failureMessage,
      providerRequest: finalBody || translatedBody,
      clientResponse: buildErrorBody(failureStatus, failureMessage),
      claudeCacheMeta: claudePromptCacheLogMeta as Record<string, unknown> | undefined,
    });
    if (error.name === "AbortError") {
      streamController.handleError(error);
      return { done: true, result: createErrorResult(499, "Request aborted") };
    }
    p.persistFailureUsage(
      HTTP_STATUS.BAD_GATEWAY,
      error instanceof Error && error.name ? error.name : "upstream_error"
    );
    console.log(`${COLORS.red}[ERROR] ${failureMessage}${COLORS.reset}`);
    return { done: true, result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, failureMessage) };
  }

  p.providerResponse = providerResponse;
  p.providerUrl = providerUrl;
  p.providerHeaders = providerHeaders;
  p.finalBody = finalBody;
  p.claudePromptCacheLogMeta = claudePromptCacheLogMeta;

  return { done: false };
}
