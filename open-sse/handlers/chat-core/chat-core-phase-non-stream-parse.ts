import { trackPendingRequest } from "@/lib/usageDb";
import { HTTP_STATUS } from "../../config/constants.ts";
import { isEmptyContentResponse } from "../../services/errorClassifier.ts";
import { chatCoreNonStreamEmptyContentFallback } from "./chat-core-non-stream-empty-fallback.ts";
import { FORMATS } from "../../translator/formats.ts";
import { buildErrorBody, createErrorResult } from "../../utils/error.ts";
import { normalizePayloadForLog } from "@/lib/logPayloads";
import {
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse,
  parseSSEToResponsesOutput,
} from "../sseParser.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown } | { done: false };

export async function chatCorePhaseNonStreamParse(p: ChatCorePipeline): Promise<PhaseOutcome> {
  const persistAttemptLogs = p.persistAttemptLogs as NonNullable<
    ChatCorePipeline["persistAttemptLogs"]
  >;
  const translatedBody = p.translatedBody as Record<string, unknown>;
  let currentModel = p.currentModel as string;
  let providerUrl = p.providerUrl as string;
  let providerHeaders = p.providerHeaders as Headers;
  let finalBody = p.finalBody;
  const providerResponse = p.providerResponse as Response;

  trackPendingRequest(p.model, p.provider, p.connectionId, false);
  const contentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  let responseBody: unknown;
  const rawBody = await providerResponse.text();
  const normalizedProviderPayload = normalizePayloadForLog(rawBody);
  const looksLikeSSE =
    contentType.includes("text/event-stream") || /(^|\n)\s*(event|data):/m.test(rawBody);

  if (looksLikeSSE) {
    const parsedFromSSE =
      p.targetFormat === FORMATS.OPENAI_RESPONSES
        ? parseSSEToResponsesOutput(rawBody, p.model)
        : p.targetFormat === FORMATS.CLAUDE
          ? parseSSEToClaudeResponse(rawBody, p.model)
          : parseSSEToOpenAIResponse(rawBody, p.model);
    if (!parsedFromSSE) {
      const invalidSseMessage = "Invalid SSE response for non-streaming request";
      persistAttemptLogs({
        status: HTTP_STATUS.BAD_GATEWAY,
        error: invalidSseMessage,
        providerRequest: finalBody || translatedBody,
        providerResponse: normalizedProviderPayload,
        clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidSseMessage),
      });
      p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_sse_payload");
      return { done: true, result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidSseMessage) };
    }
    responseBody = parsedFromSSE;
  } else {
    const looksLikeHtml =
      contentType.includes("text/html") || /^\s*<(?:!doctype html|html|body)\b/i.test(rawBody);
    if (looksLikeHtml) {
      const htmlErrorMessage = "Provider returned HTML error page";
      persistAttemptLogs({
        status: HTTP_STATUS.BAD_GATEWAY,
        error: htmlErrorMessage,
        providerRequest: finalBody || translatedBody,
        providerResponse: normalizedProviderPayload,
        clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage),
      });
      p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "html_error_payload");
      return { done: true, result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, htmlErrorMessage) };
    }
    try {
      responseBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      const invalidJsonMessage = `${providerResponse.status} upstream returned non-JSON response`;
      persistAttemptLogs({
        status: HTTP_STATUS.BAD_GATEWAY,
        error: invalidJsonMessage,
        providerRequest: finalBody || translatedBody,
        providerResponse: normalizedProviderPayload,
        clientResponse: buildErrorBody(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage),
      });
      p.persistFailureUsage(HTTP_STATUS.BAD_GATEWAY, "invalid_json_payload");
      return { done: true, result: createErrorResult(HTTP_STATUS.BAD_GATEWAY, invalidJsonMessage) };
    }
  }

  if (isEmptyContentResponse(responseBody)) {
    const emptyR = await chatCoreNonStreamEmptyContentFallback(p, {
      normalizedProviderPayload,
      finalBody,
      translatedBody,
      currentModel,
      responseBody,
      looksLikeSSE,
    });
    if (emptyR.done) return emptyR;
    return { done: false };
  }

  p.nonStreamResponseBody = responseBody;
  p.nonStreamLooksLikeSse = looksLikeSSE;
  p.currentModel = currentModel;
  p.translatedBody = translatedBody;
  p.providerUrl = providerUrl;
  p.providerHeaders = providerHeaders;
  p.finalBody = finalBody;
  return { done: false };
}
