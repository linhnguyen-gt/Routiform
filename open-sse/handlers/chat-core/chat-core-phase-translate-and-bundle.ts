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
import {
  applyStackedCompression,
  formatStackHeader,
  resolveCompressionBodies,
} from "../../compression/index.ts";
import {
  getCavemanOutputLevel,
  isProxyContextCompressionEnabled,
} from "../../services/contextValidationSettings.ts";
import { sanitizeRequestInput } from "../phases/input-sanitizer.ts";
import { checkSemanticCache } from "../phases/semantic-cache-handler.ts";
import { createBuildUpstreamHeadersForExecute } from "./chat-core-build-upstream-headers.ts";
import { createExecuteProviderRequestBundle } from "./chat-core-create-execute-provider-request.ts";
import { extractToolNameMapAndTuneTranslatedBody } from "./chat-core-post-translate-tune.ts";
import type { HandlerLogger, ProviderCredentials, RawRequestLike } from "../types/chat-core.ts";
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

  // Resolve `p.rawBody` (pristine, read-only from here on) and reassign
  // `p.body` to a PRIVATE clone before compression mutates it in place.
  //
  // `p.body` may be ALIASED with the caller's own object: the credential
  // retry loop and combo inner-retry loop reuse the same client body across
  // attempts via a shallow `{ ...body, model }` spread (src/sse/handlers/
  // chat.ts:836), so nested arrays/objects (`messages`, `system`,
  // `systemInstruction.parts`) are the SAME references the caller (and every
  // subsequent retry attempt) holds. Compressing `p.body` directly would
  // mutate the caller's own arrays — every retry re-injects the directive
  // into the client's data, and the "pristine" snapshot taken on the next
  // attempt would already be polluted (breaking call-log/semantic-cache
  // stability). `resolveCompressionBodies` skips the clone entirely when
  // compression cannot mutate anything (the default: disabled + caveman
  // output off), keeping the common-case request byte-identical with zero
  // clone cost.
  //
  // Anything downstream that needs "what the client actually sent"
  // (semantic-cache signature, the persisted call-log requestBody) must read
  // `p.rawBody`, not `p.body`, or its signature/log would silently start
  // varying with the requester's compression settings.
  const compressionEnabled = await isProxyContextCompressionEnabled();
  const cavemanOutputLevel = await getCavemanOutputLevel().catch(() => "off" as const);
  const resolvedBodies = resolveCompressionBodies(p.body, {
    compressionEnabled,
    cavemanOutputLevel,
  });
  p.rawBody = resolvedBodies.rawBody;
  p.body = resolvedBodies.body;

  // Stacked compression: RTK (tool_result) → Caveman EN (prose) → inflation
  // guard → Caveman Output (system-prompt terseness directive). Gated by
  // Dashboard AI request context (auto-compress vs passthrough). RTK profile
  // (off|safe|full) is resolved from the client User-Agent.
  //
  // Runs on the INBOUND body, BEFORE format translation, not on the
  // translated body. The compression code only understands `messages` /
  // `system` shapes; translation reshapes the body per target (`input` +
  // `instructions` for Responses/Codex, `contents` + `systemInstruction` for
  // Gemini, `conversationState` for Kiro), so compressing after translation
  // silently no-oped for every non-openai/claude target. Compressing the
  // inbound body instead means each target's translator (which already knows
  // how to carry a system prompt into its own shape) carries the
  // compressed/injected content forward for free. See
  // docs/CODEBASE_DOCUMENTATION.md and tests/unit/compression-cross-provider-injection.test.mjs.
  const stack = applyStackedCompression(p.body, {
    enabled: compressionEnabled,
    userAgent: p.userAgent,
    caveman: true,
    cavemanOutputLevel,
  });
  for (const line of stack.logs) {
    const tag = line.startsWith("[Caveman]")
      ? "Caveman"
      : line.startsWith("[Compression]")
        ? "Compression"
        : "RTK";
    log?.info?.(tag, line);
  }
  if (
    stack.mode !== "off" &&
    stack.rtkProfile !== "off" &&
    stack.rtkProfile !== "full" &&
    !stack.logs.some((l) => l.startsWith("[RTK]"))
  ) {
    log?.info?.(
      "RTK",
      `profile=${stack.rtkProfile} ua=${String(p.userAgent ?? "unknown").slice(0, 30)}`
    );
  }
  p.compressionHeader = formatStackHeader(stack);

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
