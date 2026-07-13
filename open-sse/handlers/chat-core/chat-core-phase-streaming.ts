import { recordCost } from "@/domain/costRules";
import { calculateCost } from "@/lib/usage/costCalculator";
import { saveRequestUsage } from "@/lib/usageDb";
import { FORMATS } from "../../translator/formats.ts";
import { needsTranslation } from "../../translator/index.ts";
import { getCorsOrigin } from "../../utils/cors.ts";
import { isDroidCliUserAgent } from "../../utils/clientDetection.ts";
import { createProgressTransform, wantsProgress } from "../../utils/progressTracker.ts";
import {
  createPassthroughStreamWithLogger,
  createSSETransformStreamWithLogger,
} from "../../utils/stream.ts";
import { pipeWithDisconnect } from "../../utils/streamHandler.ts";

type StreamControllerForPipe = Parameters<typeof pipeWithDisconnect>[2];
import { buildCacheUsageLogMeta } from "../utils/cache-log-helpers.ts";
import { cacheReasoningFromAssistantMessage } from "../../services/reasoningCache.ts";
import { createErrorResult } from "../../utils/error.ts";
import { toPositiveNumber } from "./chat-core-flags.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type StreamCompleteArgs = {
  status?: number;
  usage?: unknown;
  responseBody?: unknown;
  providerPayload?: unknown;
  clientPayload?: unknown;
  ttft?: number;
};

export async function chatCorePhaseStreamingResponse(
  p: ChatCorePipeline
): Promise<{ success: true; response: Response } | ReturnType<typeof createErrorResult>> {
  const log = p.log as { debug?: (t: string, m: string) => void } | undefined;
  const clientRawRequest = p.clientRawRequest as { headers?: Headers } | undefined;
  const apiKeyInfo = p.apiKeyInfo as { id?: string } | null;
  const persistAttemptLogs = p.persistAttemptLogs as NonNullable<
    ChatCorePipeline["persistAttemptLogs"]
  >;
  const reqLogger = p.reqLogger as unknown;
  const translatedBody = p.translatedBody as Record<string, unknown>;
  const providerResponse = p.providerResponse as Response;
  const streamController = p.streamController as StreamControllerForPipe;
  const finalBody = p.finalBody;
  const claudePromptCacheLogMeta = p.claudePromptCacheLogMeta;

  // Guard against non-SSE upstream bodies (WAF/captcha interstitials served
  // with a 2xx status, malformed gateway responses, etc.) reaching the SSE
  // transform stream. Piping raw HTML through pipeWithDisconnect crashes with
  // an unhandled "failed to pipe response" instead of a clean error — read
  // the body, pull a short human-readable message from <title> (that's where
  // Cloudflare puts the useful part), sanitize it, and return a JSON error so
  // normal failover/error handling can run instead of taking the router down.
  //
  // By this point `chatCorePhaseUpstreamErrors` has already filtered out every
  // non-2xx response (it returns `{done:true}` for any `!providerResponse.ok`),
  // so `providerResponse.status` is guaranteed to be 2xx here. Forwarding that
  // 2xx status verbatim (e.g. via `providerResponse.status || 502`) would make
  // `createErrorResult` return HTTP 200 with an `{"error":...}` body — clients
  // parse that as a successful completion and `shouldFallback` never triggers.
  // Always surface 502 for the ok-but-not-SSE case; only fall back to the
  // upstream status when this guard is exercised directly against an
  // already-erroring response (unit tests / defensive reuse).
  //
  // Strict allowlist when a content-type is present: `text/event-stream` (SSE),
  // `application/json` (a few providers answer with a single JSON object), or
  // `application/x-ndjson`. `text/plain` is deliberately NOT allowed — it is the
  // most common content-type for WAF/proxy interstitial pages, and allowing it
  // re-opens the exact hole this guard closes (empty 200, no failover).
  //
  // A MISSING/empty content-type must fail OPEN. Codex streams SSE with no
  // content-type header at all; rejecting "no header" 502s a healthy provider.
  // Absence of a header is not evidence of a bad body — only a present-and-wrong
  // header is.
  const upstreamContentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  const isAllowedStreamingContentType =
    !upstreamContentType ||
    upstreamContentType.includes("text/event-stream") ||
    upstreamContentType.includes("application/json") ||
    upstreamContentType.includes("application/x-ndjson");
  if (!isAllowedStreamingContentType) {
    const bodyText = await providerResponse.text().catch(() => "");
    const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
    const sanitizedTitle = (titleMatch?.[1] || "")
      .replace(/<[^>]*>/g, "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 160);
    const shortMsg =
      sanitizedTitle ||
      (bodyText.length < 200
        ? bodyText
            .replace(/<[^>]*>/g, "")
            .trim()
            .slice(0, 160)
        : `Upstream returned non-SSE response (${upstreamContentType || "missing content-type"})`);
    const status = providerResponse.ok ? 502 : providerResponse.status || 502;
    log?.debug?.(
      "STREAM",
      `${p.provider} | ${p.model} | blocked non-SSE pipe: ${shortMsg} [${status}]`
    );
    streamController.handleError(new Error(`upstream non-SSE: ${status}`));
    return createErrorResult(status, `[${status}]: ${shortMsg}`);
  }

  // Only clear the account's error state once the upstream body has been
  // confirmed to be a legitimate SSE/JSON stream — matches the non-streaming
  // phase's ordering (chat-core-phase-non-stream-complete.ts), which validates
  // the response before calling onRequestSuccess. Calling this before the
  // guard above would mark a WAF-interstitial-serving account as healthy
  // moments before rejecting its response.
  if (p.onRequestSuccess) {
    await p.onRequestSuccess();
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": getCorsOrigin(),
  };

  let transformStream: TransformStream;

  const onStreamComplete = ({
    status: streamStatus,
    usage: streamUsage,
    responseBody: streamResponseBody,
    providerPayload,
    clientPayload,
    ttft,
  }: StreamCompleteArgs) => {
    try {
      const assistantMessage = (streamResponseBody as Record<string, unknown>)?.choices?.[0]
        ?.message;
      cacheReasoningFromAssistantMessage(
        assistantMessage as Record<string, unknown>,
        p.provider,
        p.model
      );
    } catch {
      // Reasoning cache capture is best effort only.
    }

    const cacheUsageLogMeta = buildCacheUsageLogMeta(
      streamUsage as Record<string, unknown> | null | undefined
    );

    if (streamUsage && typeof streamUsage === "object") {
      const _inputTokens = (streamUsage as { prompt_tokens?: number }).prompt_tokens || 0;
      const _cachedTokens = toPositiveNumber(
        (streamUsage as { cache_read_input_tokens?: number }).cache_read_input_tokens ??
          (streamUsage as { cached_tokens?: number }).cached_tokens ??
          (
            (streamUsage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cached_tokens
      );
      const _cacheCreationTokens = toPositiveNumber(
        (streamUsage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ??
          (
            (streamUsage as Record<string, unknown>).prompt_tokens_details as
              | Record<string, unknown>
              | undefined
          )?.cache_creation_tokens
      );

      saveRequestUsage({
        provider: p.provider || "unknown",
        model: p.model || "unknown",
        tokens: streamUsage,
        status: String(streamStatus || 200),
        success: streamStatus === 200,
        latencyMs: Date.now() - p.startTime,
        timeToFirstTokenMs: ttft,
        errorCode: null,
        timestamp: new Date().toISOString(),
        connectionId: p.connectionId || undefined,
        apiKeyId: apiKeyInfo?.id || undefined,
        apiKeyName: (apiKeyInfo as { name?: string } | null)?.name || undefined,
      }).catch((err: Error) => {
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
      claudeCacheMeta: claudePromptCacheLogMeta as Record<string, unknown> | undefined,
      claudeCacheUsageMeta: cacheUsageLogMeta,
    });

    if (apiKeyInfo?.id && streamUsage) {
      calculateCost(p.provider, p.model, streamUsage)
        .then((estimatedCost) => {
          if (estimatedCost > 0) recordCost(apiKeyInfo.id, estimatedCost);
        })
        .catch(() => {});
    }
  };

  const isDroidCLI = isDroidCliUserAgent(p.userAgent);
  const needsResponsesTranslation =
    p.targetFormat === FORMATS.OPENAI_RESPONSES &&
    p.sourceFormat === FORMATS.OPENAI &&
    !p.isResponsesEndpoint &&
    !isDroidCLI;

  if (needsResponsesTranslation) {
    log?.debug?.("STREAM", `Responses translation mode: openai-responses → openai`);
    transformStream = createSSETransformStreamWithLogger(
      "openai-responses",
      "openai",
      p.provider,
      reqLogger,
      p.toolNameMap,
      p.model,
      p.connectionId,
      p.body,
      onStreamComplete,
      apiKeyInfo
    );
  } else if (needsTranslation(p.targetFormat || "", p.sourceFormat || "")) {
    log?.debug?.("STREAM", `Translation mode: ${p.targetFormat} → ${p.sourceFormat}`);
    transformStream = createSSETransformStreamWithLogger(
      p.targetFormat || "",
      p.sourceFormat || "",
      p.provider,
      reqLogger,
      p.toolNameMap,
      p.model,
      p.connectionId,
      p.body,
      onStreamComplete,
      apiKeyInfo
    );
  } else {
    log?.debug?.("STREAM", `Standard passthrough mode`);
    transformStream = createPassthroughStreamWithLogger(
      p.provider,
      reqLogger,
      p.toolNameMap,
      p.model,
      p.connectionId,
      p.body,
      onStreamComplete,
      apiKeyInfo
    );
  }

  const progressEnabled = wantsProgress(clientRawRequest?.headers);
  let finalStream: ReadableStream<Uint8Array>;
  if (progressEnabled) {
    const progressTransform = createProgressTransform({ signal: streamController.signal });
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
