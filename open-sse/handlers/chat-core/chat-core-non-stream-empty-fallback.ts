import { HTTP_STATUS } from "../../config/constants.ts";
import { getNextFamilyFallback } from "../../services/modelFamilyFallback.ts";
import { buildErrorBody, createErrorResult } from "../../utils/error.ts";
import { normalizePayloadForLog } from "@/lib/logPayloads";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown } | { done: false };

export type EmptyCtx = {
  normalizedProviderPayload: unknown;
  finalBody: unknown;
  translatedBody: Record<string, unknown>;
  currentModel: string;
  responseBody: unknown;
  looksLikeSSE: boolean;
};

export async function chatCoreNonStreamEmptyContentFallback(
  p: ChatCorePipeline,
  ctx: EmptyCtx
): Promise<PhaseOutcome> {
  const log = p.log as { info?: (t: string, m: string) => void } | undefined;
  const persistAttemptLogs = p.persistAttemptLogs as NonNullable<
    ChatCorePipeline["persistAttemptLogs"]
  >;
  const executeProviderRequest = p.executeProviderRequest as NonNullable<
    ChatCorePipeline["executeProviderRequest"]
  >;
  const reqLogger = p.reqLogger as {
    logTargetRequest: (u: string, h: Headers, b: unknown) => void;
  };
  const triedModels = p.triedModels as Set<string>;
  let {
    normalizedProviderPayload,
    finalBody,
    translatedBody,
    currentModel,
    responseBody,
    looksLikeSSE,
  } = ctx;
  let providerUrl = p.providerUrl as string;
  let providerHeaders = p.providerHeaders as Headers;
  const emptyContentMessage = "Provider returned empty content";
  persistAttemptLogs({
    status: HTTP_STATUS.BAD_GATEWAY,
    error: emptyContentMessage,
    providerRequest: finalBody || translatedBody,
    providerResponse: normalizedProviderPayload,
    clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, emptyContentMessage),
  });
  p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content");

  const nextModel = getNextFamilyFallback(currentModel, triedModels);
  if (nextModel) {
    triedModels.add(nextModel);
    currentModel = nextModel;
    translatedBody.model = nextModel;
    log?.info?.(
      "EMPTY_CONTENT_FALLBACK",
      `${p.model} returned empty content → trying ${nextModel}`
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
          p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "html_error_payload");
          return {
            done: true,
            result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage),
          };
        }
        try {
          responseBody = fallbackRaw ? JSON.parse(fallbackRaw) : {};
          providerUrl = fallbackResult.url;
          providerHeaders = fallbackResult.headers;
          finalBody = fallbackResult.transformedBody;
          reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
          log?.info?.("EMPTY_CONTENT_FALLBACK", `Serving ${nextModel} as fallback for ${p.model}`);
        } catch {
          const invalidJsonMessage = fallbackRaw.trim() || "Invalid JSON response from provider";
          persistAttemptLogs({
            status: HTTP_STATUS.BAD_GATEWAY,
            error: invalidJsonMessage,
            providerRequest: fallbackResult.transformedBody || translatedBody,
            providerResponse: fallbackNormalizedProviderPayload,
            clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage),
          });
          p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_json_payload");
          return {
            done: true,
            result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage),
          };
        }
      } else {
        const fallbackStatusMessage = `Fallback provider returned ${fallbackResult.response.status}`;
        persistAttemptLogs({
          status: HTTP_STATUS.BAD_GATEWAY,
          error: fallbackStatusMessage,
          providerRequest: fallbackResult.transformedBody || translatedBody,
          clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, fallbackStatusMessage),
        });
        p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_fallback_failed");
        return {
          done: true,
          result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, fallbackStatusMessage),
        };
      }
    } catch {
      const fallbackExecutionMessage = "Fallback provider request failed after empty content";
      persistAttemptLogs({
        status: HTTP_STATUS.BAD_GATEWAY,
        error: fallbackExecutionMessage,
        providerRequest: finalBody || translatedBody,
        clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, fallbackExecutionMessage),
      });
      p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_fallback_request_failed");
      return {
        done: true,
        result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, fallbackExecutionMessage),
      };
    }
  } else {
    const noFallbackMessage = "Provider returned empty content and no fallback model was available";
    persistAttemptLogs({
      status: HTTP_STATUS.BAD_GATEWAY,
      error: noFallbackMessage,
      providerRequest: finalBody || translatedBody,
      providerResponse: normalizedProviderPayload,
      clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, noFallbackMessage),
    });
    p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "empty_content_no_fallback");
    return { done: true, result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, noFallbackMessage) };
  }

  p.currentModel = currentModel;
  p.translatedBody = translatedBody;
  p.providerUrl = providerUrl;
  p.providerHeaders = providerHeaders;
  p.finalBody = finalBody;
  p.nonStreamResponseBody = responseBody;
  p.nonStreamLooksLikeSse = looksLikeSSE;
  return { done: false };
}
