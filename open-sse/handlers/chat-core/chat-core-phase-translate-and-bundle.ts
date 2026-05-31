import { getCacheControlSettings } from "@/lib/cacheControlSettings";
import { isClaudeCodeCompatibleProvider } from "../../services/claudeCodeCompatible.ts";
import { FORMATS } from "../../translator/formats.ts";
import {
  resolveExplicitStreamAlias,
  resolveStreamFlag,
  stripNonStandardStreamAliases,
} from "../../utils/aiSdkCompat.ts";
import { shouldPreserveCacheControl } from "../../utils/cacheControlPolicy.ts";
import { createRequestLogger } from "../../utils/requestLogger.ts";
import { sanitizeRequestInput } from "../phases/input-sanitizer.ts";
import { checkSemanticCache } from "../phases/semantic-cache-handler.ts";
import { validateAndCompressContext } from "../phases/context-validator.ts";
import { createBuildUpstreamHeadersForExecute } from "./chat-core-build-upstream-headers.ts";
import { createExecuteProviderRequestBundle } from "./chat-core-create-execute-provider-request.ts";
import { extractToolNameMapAndTuneTranslatedBody } from "./chat-core-post-translate-tune.ts";
import type {
  HandlerLogger,
  JsonRecord,
  ProviderCredentials,
  RawRequestLike,
} from "../types/chat-core.ts";
import type { RoutingStrategyValue } from "../../../src/shared/constants/routingStrategies.ts";
import { translateInboundRequestBody } from "./chat-core-translate-inbound-body.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";
type PhaseOutcome = { done: true; result: unknown } | { done: false };

export async function chatCorePhaseTranslateAndBundle(p: ChatCorePipeline): Promise<PhaseOutcome> {
  const log = p.log as HandlerLogger | null | undefined;
  const clientRawRequest = p.clientRawRequest as RawRequestLike | null | undefined;
  const credentials = p.credentials as ProviderCredentials;
  const apiKeyInfo = p.apiKeyInfo as Record<string, unknown> | null;
  const connectionCustomUserAgent =
    credentials?.providerSpecificData &&
    typeof credentials.providerSpecificData === "object" &&
    typeof (credentials.providerSpecificData as { customUserAgent?: string }).customUserAgent ===
      "string"
      ? String(
          (credentials.providerSpecificData as { customUserAgent: string }).customUserAgent
        ).trim()
      : "";

  p.buildUpstreamHeadersForExecute = createBuildUpstreamHeadersForExecute({
    provider: p.provider || "",
    model: p.model,
    resolvedModel: p.resolvedModel || "",
    effectiveModel: p.effectiveModel || "",
    sourceFormat: p.sourceFormat || "",
    connectionCustomUserAgent,
    clientRawRequest,
  });

  const acceptHeader =
    clientRawRequest?.headers && typeof (clientRawRequest.headers as Headers).get === "function"
      ? (clientRawRequest.headers as Headers).get("accept") ||
        (clientRawRequest.headers as Headers).get("Accept")
      : ((clientRawRequest?.headers || {}) as Record<string, string>)["accept"] ||
        ((clientRawRequest?.headers || {}) as Record<string, string>)["Accept"];

  const explicitStreamAlias = resolveExplicitStreamAlias(p.body);
  if (explicitStreamAlias !== undefined && p.body && typeof p.body === "object") {
    (p.body as Record<string, unknown>).stream = explicitStreamAlias;
  }
  const stream = resolveStreamFlag(p.body?.stream, acceptHeader);
  p.stream = stream;
  stripNonStandardStreamAliases(p.body);

  const cachedResponse = checkSemanticCache(
    p.model,
    p.body,
    clientRawRequest as { headers?: Record<string, string> } | null | undefined,
    log ?? undefined
  );
  if (cachedResponse) {
    return { done: true, result: { success: true, response: cachedResponse } };
  }

  const reqLogger = await createRequestLogger(p.sourceFormat || "", p.targetFormat || "", p.model);
  p.reqLogger = reqLogger;

  if (clientRawRequest) {
    reqLogger.logClientRawRequest(
      clientRawRequest.endpoint,
      clientRawRequest.body,
      clientRawRequest.headers
    );
  }

  log?.debug?.("FORMAT", `${p.sourceFormat} → ${p.targetFormat} | stream=${stream}`);
  p.body = (await sanitizeRequestInput(p.body, p.provider, apiKeyInfo, log)) as Record<
    string,
    unknown
  >;

  const contextResult = await validateAndCompressContext({
    body: p.body,
    provider: p.provider,
    model: p.effectiveModel,
    combo: p.combo as JsonRecord | null,
    comboName: p.comboName,
    reqLogger,
    log,
    persistFailureUsage: p.persistFailureUsage,
  });

  if (!contextResult.valid) {
    return { done: true, result: contextResult.error };
  }

  p.body = contextResult.body as Record<string, unknown>;

  if (p.targetFormat === FORMATS.OPENAI_RESPONSES) {
    if (p.body.max_tokens !== undefined && p.body.max_output_tokens === undefined) {
      p.body.max_output_tokens = p.body.max_tokens;
      delete p.body.max_tokens;
    }
    if (p.body.max_completion_tokens !== undefined && p.body.max_output_tokens === undefined) {
      p.body.max_output_tokens = p.body.max_completion_tokens;
      delete p.body.max_completion_tokens;
    }
  } else {
    if (p.body.max_output_tokens !== undefined && p.body.max_tokens === undefined) {
      p.body.max_tokens = p.body.max_output_tokens;
      delete p.body.max_output_tokens;
    }
  }

  const isClaudePassthrough =
    p.sourceFormat === FORMATS.CLAUDE && p.targetFormat === FORMATS.CLAUDE;
  p.isClaudePassthrough = isClaudePassthrough;
  const isClaudeCodeCompatible = isClaudeCodeCompatibleProvider(p.provider);
  p.isClaudeCodeCompatible = isClaudeCodeCompatible;
  const upstreamStream = stream || isClaudeCodeCompatible;
  p.upstreamStream = upstreamStream;

  const cacheControlMode = await getCacheControlSettings().catch(() => "auto" as const);
  const preserveCacheControl = shouldPreserveCacheControl({
    userAgent: p.userAgent,
    isCombo: p.isCombo,
    comboStrategy: p.comboStrategy as RoutingStrategyValue | null | undefined,
    targetProvider: p.provider,
    targetFormat: p.targetFormat,
    settings: { alwaysPreserveClientCache: cacheControlMode },
  });

  if (preserveCacheControl) {
    log?.debug?.(
      "CACHE",
      `Preserving client cache_control (client=${p.userAgent?.substring(0, 20)}, combo=${p.isCombo}, strategy=${p.comboStrategy}, provider=${p.provider})`
    );
  }

  const translateResult = await translateInboundRequestBody({
    nativeCodexPassthrough: !!p.nativeCodexPassthrough,
    isClaudeCodeCompatible,
    isClaudePassthrough,
    body: p.body,
    provider: p.provider || "",
    model: p.model,
    sourceFormat: p.sourceFormat || "",
    targetFormat: p.targetFormat || "",
    stream,
    credentials,
    reqLogger,
    preserveCacheControl,
    log,
    clientRawRequest,
    resolvedModel: p.resolvedModel || "",
    upstreamStream,
  });
  if (translateResult.ok === false) {
    return { done: true, result: translateResult.failure };
  }
  let translatedBody = translateResult.translatedBody as Record<string, unknown>;
  p.translatedBody = translatedBody;
  p.ccSessionId = translateResult.ccSessionId;

  p.toolNameMap = extractToolNameMapAndTuneTranslatedBody({
    translatedBody,
    body: p.body,
    isClaudePassthrough,
    effectiveModel: p.effectiveModel || "",
    provider: p.provider || "",
    model: p.model,
    log,
  });

  const bundle = await createExecuteProviderRequestBundle({
    provider: p.provider || "",
    model: p.model,
    effectiveModel: p.effectiveModel || "",
    translatedBody,
    stream,
    upstreamStream,
    credentials,
    nativeCodexPassthrough: !!p.nativeCodexPassthrough,
    endpointPath: p.endpointPath || "",
    ccSessionId: p.ccSessionId,
    targetFormat: p.targetFormat || "",
    connectionId: p.connectionId,
    extendedContext: p.extendedContext,
    log,
    onDisconnect: p.onDisconnect,
    buildUpstreamHeadersForExecute: p.buildUpstreamHeadersForExecute as (
      modelToCall: string
    ) => Record<string, string>,
    clientRawRequest: p.clientRawRequest as Parameters<
      typeof createExecuteProviderRequestBundle
    >[0]["clientRawRequest"],
    combo: (p.combo ?? null) as Parameters<typeof createExecuteProviderRequestBundle>[0]["combo"],
  });

  p.executor = bundle.executor;
  p.getExecutionCredentials = bundle.getExecutionCredentials;
  p.streamController = bundle.streamController;
  p.executeProviderRequest = bundle.executeProviderRequest;
  return { done: false };
}
