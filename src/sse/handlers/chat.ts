import {
  getProviderCredentials,
  hasActiveProviderConnection,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth";
import { getModelInfo, getComboForModel } from "../services/model";
import {
  detectFormatFromEndpoint,
  getTargetFormat,
} from "@routiform/open-sse/services/provider.ts";
import { handleChatCore } from "@routiform/open-sse/handlers/chatCore.ts";
import { errorResponse, unavailableResponse } from "@routiform/open-sse/utils/error.ts";
import { handleComboChat } from "@routiform/open-sse/services/combo.ts";
import { HTTP_STATUS } from "@routiform/open-sse/config/constants.ts";
import {
  getModelTargetFormat,
  PROVIDER_ID_TO_ALIAS,
} from "@routiform/open-sse/config/providerModels.ts";
import {
  runWithProxyContext,
  runWithTlsTracking,
  isTlsFingerprintActive,
} from "@routiform/open-sse/utils/proxyFetch.ts";
import { cacheClaudeHeaders } from "@routiform/open-sse/utils/claudeHeaderCache.ts";
import * as log from "../utils/logger";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh";
import { getSettings, getCombos } from "@/lib/localDb";
import { resolveProxyForConnection } from "@/lib/localDb";
import { logProxyEvent } from "../../lib/proxyLogger";
import { logTranslationEvent } from "../../lib/translatorEvents";
import { sanitizeRequest } from "../../shared/utils/inputSanitizer";
import { getGlobalFallbackStatusCodes } from "@/lib/globalComboFallback";

type ComboRecord = {
  name: string;
  models: unknown[];
  strategy?: string | null;
  context_length?: number;
};

// Pipeline integration — wired modules
import { getCircuitBreaker, CircuitBreakerOpenError } from "../../shared/utils/circuitBreaker";
import {
  isModelAvailable,
  setModelUnavailable,
  setModelProblematic,
  clearModelUnavailability,
} from "../../domain/modelAvailability";
import { markAccountExhaustedFrom429 } from "../../domain/quotaCache";
import { RequestTelemetry, recordTelemetry } from "../../shared/utils/requestTelemetry";
import { generateRequestId } from "../../shared/utils/requestId";
import { enforceApiKeyPolicy } from "../../shared/utils/apiKeyPolicy";
import { cloneLogPayload } from "@/lib/logPayloads";
import {
  applyTaskAwareRouting,
  getTaskRoutingConfig,
} from "@routiform/open-sse/services/taskAwareRouter.ts";
import {
  generateSessionId as generateStableSessionId,
  touchSession,
  extractExternalSessionId,
  checkSessionLimit,
  registerKeySession,
  isSessionRegisteredForKey,
} from "@routiform/open-sse/services/sessionManager.ts";
import {
  isFallbackDecision,
  shouldUseFallback,
} from "@routiform/open-sse/services/emergencyFallback.ts";
import {
  buildCooldownAwareRetryConfig,
  shouldRetryOnCooldown,
  waitForCooldown,
} from "../services/cooldownAwareRetry";

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(
  request: Request,
  clientRawRequest: Record<string, unknown> | null = null
) {
  // Pipeline: Start request telemetry
  const reqId = generateRequestId();
  const telemetry = new RequestTelemetry(reqId);

  let body;
  try {
    telemetry.startPhase("parse");
    body = await request.json();
    telemetry.endPhase();
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const rawClientBody = cloneLogPayload(body);

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    clientRawRequest = buildClientRawRequest(request, rawClientBody);
  }
  cacheClaudeHeaders(clientRawRequest.headers as Record<string, unknown>);

  // FASE-01: Input sanitization — prompt injection detection & PII redaction
  telemetry.startPhase("validate");
  const sanitizeResult = sanitizeRequest(body, log as unknown as Console);
  if (sanitizeResult.blocked) {
    log.warn("SANITIZER", "Request blocked due to prompt injection", {
      detections: sanitizeResult.detections,
    });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Request rejected: suspicious content detected");
  }
  if (sanitizeResult.modified && sanitizeResult.sanitizedBody) {
    body = sanitizeResult.sanitizedBody;
  }
  telemetry.endPhase();

  // T01 — Accept header negotiation
  // If client asks for text/event-stream via the Accept header AND the JSON body
  // does not explicitly set stream=false, treat it as stream=true.
  // This ensures compatibility with curl/httpx and similar non-OpenAI clients.
  //
  // FIX #302: OpenAI Python SDK sends Accept: application/json, text/event-stream
  // in every request — even when called with stream=False. We must NOT override
  // an explicit stream=false body field, as that silently breaks tool_calls and
  // structured completions for SDK users who rely on non-streaming mode.
  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/event-stream") && body.stream === undefined) {
    body = { ...body, stream: true };
    log.debug(
      "STREAM",
      "Accept: text/event-stream header → overriding stream=true (body had no stream field)"
    );
  }

  // Log request endpoint and model
  const url = new URL(request.url);
  const modelStr = body.model;

  // Count messages (support both messages[] and input[] formats)
  const msgCount = body.messages?.length || body.input?.length || 0;
  const toolCount = body.tools?.length || 0;
  const effort = body.reasoning_effort || body.reasoning?.effort || null;
  log.request(
    "POST",
    `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`
  );

  // Log API key (masked) — Bearer or x-api-key via extractApiKey
  const apiKey = extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Strict API key mode: only when REQUIRE_API_KEY=true (aligned with 9router default).
  const isComboLiveTest = request.headers?.get?.("x-internal-test") === "combo-health-check";
  if (process.env.REQUIRE_API_KEY === "true" && !isComboLiveTest) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key while REQUIRE_API_KEY=true");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key while REQUIRE_API_KEY=true");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // T04: client-provided external session header has priority over generated fingerprint.
  const externalSessionId = extractExternalSessionId(request.headers);
  const sessionId = externalSessionId || generateStableSessionId(body);
  if (sessionId) {
    touchSession(sessionId);
  }

  // Pipeline: API key policy enforcement (model restrictions + budget limits)
  telemetry.startPhase("policy");
  const policy = await enforceApiKeyPolicy(request, modelStr);
  if (policy.rejection) {
    log.warn(
      "POLICY",
      `API key policy rejected: ${modelStr} (key=${policy.apiKeyInfo?.id || "unknown"})`
    );
    return policy.rejection;
  }
  const apiKeyInfo = policy.apiKeyInfo as unknown as Record<string, unknown> | null;
  telemetry.endPhase();

  // T08: per-key active session limit (0 = unlimited).
  const apiKeyId = apiKeyInfo?.id ? String(apiKeyInfo.id) : null;
  if (apiKeyId && sessionId) {
    const maxSessions =
      typeof apiKeyInfo.maxSessions === "number" && apiKeyInfo.maxSessions > 0
        ? apiKeyInfo.maxSessions
        : 0;

    if (maxSessions > 0 && !isSessionRegisteredForKey(apiKeyId, sessionId)) {
      const sessionViolation = checkSessionLimit(apiKeyId, maxSessions);
      if (sessionViolation) {
        return withSessionHeader(
          errorResponse(HTTP_STATUS.RATE_LIMITED, sessionViolation.message),
          sessionId
        );
      }
      registerKeySession(apiKeyId, sessionId);
    }
  }

  // T05 — Task-Aware Smart Routing
  // Detect the semantic task type and optionally route to the optimal model
  let resolvedModelStr = modelStr;
  if (getTaskRoutingConfig().enabled) {
    telemetry.startPhase("task-route");
    const tr = applyTaskAwareRouting(modelStr, body);
    if (tr.wasRouted) {
      resolvedModelStr = tr.model;
      body = { ...body, model: tr.model };
      log.info(
        "T05",
        `Task-Aware: detected="${tr.taskType}" → model override: ${modelStr} → ${tr.model}`
      );
    } else if (tr.taskType !== "chat") {
      log.debug("T05", `Task-Aware: detected="${tr.taskType}" (no override configured)`);
    }
    const _taskRouteInfo = { taskType: tr.taskType, wasRouted: tr.wasRouted };
    telemetry.endPhase();
  }

  // Check if model is a combo (has multiple models with fallback)
  telemetry.startPhase("resolve");
  const combo = (await getComboForModel(resolvedModelStr)) as ComboRecord | null;
  if (combo) {
    log.info(
      "CHAT",
      `Combo "${modelStr}" [${combo.strategy || "priority"}] with ${combo.models.length} models`
    );

    // Pre-check function used by combo routing. For explicit combo live tests,
    // avoid pre-skipping so each model gets a real execution attempt.
    const checkModelAvailable = async (modelString: string) => {
      if (isComboLiveTest) return true;

      // Use getModelInfo to properly resolve custom prefixes
      const modelInfo = await getModelInfo(modelString);
      const provider = modelInfo.provider;
      if (!provider) return true; // can't determine provider, let it try

      // Check domain-level availability (cooldown)
      if (!isModelAvailable(provider, modelInfo.model || modelString)) {
        log.debug("AVAILABILITY", `${provider}/${modelInfo.model} in cooldown, skipping`);
        return false;
      }

      const creds = await getProviderCredentials(
        provider,
        null,
        Array.isArray(apiKeyInfo?.allowedConnections)
          ? (apiKeyInfo.allowedConnections as string[])
          : null,
        modelInfo.model || modelString
      );
      if (!creds || creds.allRateLimited) return false;
      return true;
    };

    // Fetch settings and all combos for config cascade and nested resolution
    const results = await Promise.all([
      getSettings().catch(() => ({}) as Record<string, unknown>),
      getCombos().catch((): ComboRecord[] => []),
    ]);
    const [settings, allCombos]: [Record<string, unknown>, ComboRecord[]] = results as [
      Record<string, unknown>,
      ComboRecord[],
    ];
    telemetry.endPhase();

    const response = await (
      handleComboChat as (args: {
        body: Record<string, unknown>;
        combo: ComboRecord;
        handleSingleModel: (b: Record<string, unknown>, m: string) => Promise<Response>;
        isModelAvailable: (modelString: string) => Promise<boolean>;
        log: Record<string, unknown>;
        settings: Record<string, unknown>;
        allCombos: ComboRecord[];
      }) => Promise<Response>
    )({
      body,
      combo,
      handleSingleModel: (b: Record<string, unknown>, m: string) =>
        handleSingleModelChat(
          b,
          m,
          clientRawRequest,
          request,
          combo.name,
          apiKeyInfo,
          telemetry,
          {
            sessionId,
            forceLiveComboTest: isComboLiveTest,
          },
          combo.strategy || null,
          true,
          combo
        ),
      isModelAvailable: checkModelAvailable,
      log: log as unknown as Record<string, unknown>,
      settings,
      allCombos,
    });

    // ── Global Fallback Provider (#689) ────────────────────────────────────
    // If combo exhausted all models, try the global fallback before giving up.
    const fallbackTriggers = getGlobalFallbackStatusCodes(
      settings as unknown as Record<string, unknown>
    );
    const settingsObj = settings as unknown as Record<string, unknown>;
    if (
      !response.ok &&
      fallbackTriggers.includes(response.status) &&
      typeof settingsObj?.globalFallbackModel === "string" &&
      (settingsObj.globalFallbackModel as string).trim()
    ) {
      const fallbackModel = (settingsObj.globalFallbackModel as string).trim();
      log.info(
        "GLOBAL_FALLBACK",
        `Combo "${combo.name}" exhausted — attempting global fallback: ${fallbackModel}`
      );
      try {
        const fallbackResponse = await handleSingleModelChat(
          body,
          fallbackModel,
          clientRawRequest,
          request,
          combo.name,
          apiKeyInfo,
          telemetry,
          { sessionId, emergencyFallbackTried: true, forceLiveComboTest: isComboLiveTest },
          combo.strategy,
          true
        );
        if (fallbackResponse.ok) {
          log.info("GLOBAL_FALLBACK", `Global fallback ${fallbackModel} succeeded`);
          recordTelemetry(telemetry);
          return withSessionHeader(fallbackResponse, sessionId);
        }
        log.warn(
          "GLOBAL_FALLBACK",
          `Global fallback ${fallbackModel} also failed (${fallbackResponse.status})`
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.warn("GLOBAL_FALLBACK", `Global fallback error: ${errorMessage}`);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Record telemetry
    recordTelemetry(telemetry);
    return withSessionHeader(response, sessionId);
  }
  telemetry.endPhase();

  // Single model request
  const response = await handleSingleModelChat(
    body,
    modelStr,
    clientRawRequest,
    request,
    null,
    apiKeyInfo,
    telemetry,
    { sessionId, forceLiveComboTest: isComboLiveTest },
    null,
    false
  );
  recordTelemetry(telemetry);
  return withSessionHeader(response, sessionId);
}

export function buildClientRawRequest(request: Request, body: unknown) {
  const url = new URL(request.url);
  return {
    endpoint: url.pathname,
    body: cloneLogPayload(body),
    headers: Object.fromEntries(request.headers.entries()),
  };
}

/**
 * Handle single model chat request
 *
 * Refactored: model resolution, logging, pipeline gates, and chat execution
 * extracted to focused helpers. This function orchestrates the credential
 * retry loop.
 */
async function handleSingleModelChat(
  body: Record<string, unknown>,
  modelStr: string,
  clientRawRequest: Record<string, unknown> | null = null,
  request: Request | null = null,
  comboName: string | null = null,
  apiKeyInfo: Record<string, unknown> | null = null,
  telemetry: RequestTelemetry | null = null,
  runtimeOptions: {
    emergencyFallbackTried?: boolean;
    forceLiveComboTest?: boolean;
    sessionId?: string | null;
  } = {},
  comboStrategy: string | null = null,
  isCombo: boolean = false,
  combo: ComboRecord | null = null
) {
  // 1. Resolve model → provider/model
  const resolved = await resolveModelOrError(
    modelStr,
    body,
    (clientRawRequest?.endpoint as string) || ""
  );
  if (resolved.error) return resolved.error;

  const { provider, model, sourceFormat, targetFormat, extendedContext } = resolved;
  const forceLiveComboTest = runtimeOptions.forceLiveComboTest === true;

  // 2. Pipeline gates (availability + circuit breaker)
  const gate = checkPipelineGates(provider, model, {
    ignoreCircuitBreaker: forceLiveComboTest,
    ignoreModelCooldown: forceLiveComboTest,
  });
  if (gate) return gate;

  const breaker = getCircuitBreaker(provider, {
    failureThreshold: 5,
    resetTimeout: 30000,
    onStateChange: (name: string, from: string, to: string) =>
      log.info("CIRCUIT", `${name}: ${from} → ${to}`),
  });

  const userAgent = request?.headers?.get("user-agent") || "";
  const retrySettings = await getSettings().catch(() => ({}) as Record<string, unknown>);
  const retryConfig = buildCooldownAwareRetryConfig(retrySettings);

  // 3. Credential retry loop (accumulate tried IDs so we never ping-pong between exhausted accounts)
  const triedConnectionIds: string[] = [];
  let lastError = null;
  let lastStatus = null;
  let sameAccountRetryCount = 0;

  while (true) {
    const credentialOptions =
      forceLiveComboTest || triedConnectionIds.length > 0
        ? {
            ...(forceLiveComboTest
              ? { allowSuppressedConnections: true, bypassQuotaPolicy: true }
              : {}),
            ...(triedConnectionIds.length > 0
              ? { excludedConnectionIds: [...triedConnectionIds] }
              : {}),
          }
        : undefined;

    const credentials = await getProviderCredentials(
      provider,
      null,
      Array.isArray(apiKeyInfo?.allowedConnections)
        ? (apiKeyInfo.allowedConnections as string[])
        : null,
      model,
      credentialOptions
    );

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited && lastStatus === 429) {
        const retryAt = credentials.retryAfter ? new Date(credentials.retryAfter).getTime() : 0;
        const retryMs = retryAt > Date.now() ? Math.min(retryAt - Date.now(), 60_000) : 0;
        if (retryMs > 0) {
          setModelUnavailable(provider, model, retryMs, "HTTP 429 all accounts rate-limited");
          log.info(
            "AVAILABILITY",
            `${provider}/${model} marked unavailable for ${Math.ceil(retryMs / 1000)}s (all accounts rate-limited)`
          );
        }
      }
      return handleNoCredentials(
        credentials,
        triedConnectionIds,
        provider,
        model,
        lastError,
        lastStatus
      );
    }

    const accountId = credentials.connectionId.slice(0, 8);
    log.info("AUTH", `Using ${provider} account: ${accountId}...`);
    if (runtimeOptions.sessionId) {
      touchSession(runtimeOptions.sessionId, credentials.connectionId);
    }

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);
    const proxyInfo = await safeResolveProxy(credentials.connectionId);
    const proxyStartTime = Date.now();

    // 4. Execute chat via core (with circuit breaker + optional TLS)
    if (telemetry) telemetry.startPhase("connect");
    const { result, tlsFingerprintUsed } = await executeChatWithBreaker({
      bypassCircuitBreaker: forceLiveComboTest,
      breaker,
      body,
      requestedModel: modelStr,
      provider,
      model,
      refreshedCredentials: refreshedCredentials as Record<string, unknown>,
      proxyInfo,
      log,
      clientRawRequest,
      credentials: credentials as Record<string, unknown>,
      apiKeyInfo,
      userAgent,
      comboName,
      comboStrategy,
      isCombo,
      combo,
      extendedContext,
    });
    if (telemetry) telemetry.endPhase();

    const proxyLatency = Date.now() - proxyStartTime;

    // 5. Log proxy + translation events
    safeLogEvents({
      result,
      proxyInfo,
      proxyLatency,
      provider,
      model,
      sourceFormat,
      targetFormat,
      credentials,
      comboName,
      clientRawRequest,
      tlsFingerprintUsed,
    });

    if (result.success) {
      clearModelUnavailability(provider, model);
      if (telemetry) telemetry.startPhase("finalize");
      if (telemetry) telemetry.endPhase();
      return result.response;
    }

    // Emergency fallback for budget exhaustion (402 / billing / quota keywords):
    // reroute to a free model (default provider/model: nvidia + openai/gpt-oss-120b) exactly once.
    if (!runtimeOptions.emergencyFallbackTried && !forceLiveComboTest) {
      const fallbackDecision = shouldUseFallback(
        Number(result.status || 0),
        String(result.error || ""),
        Array.isArray(body?.tools) && body.tools.length > 0
      );

      if (isFallbackDecision(fallbackDecision)) {
        const fallbackModelStr = `${fallbackDecision.provider}/${fallbackDecision.model}`;
        const currentModelStr = `${provider}/${model}`;

        if (!(await hasActiveProviderConnection(fallbackDecision.provider))) {
          log.warn(
            "EMERGENCY_FALLBACK",
            `Skip: no active connection for ${fallbackDecision.provider} (configure API key or disable emergency fallback target)`
          );
        } else if (fallbackModelStr !== currentModelStr) {
          const fallbackBody = { ...body, model: fallbackModelStr } as Record<string, unknown>;

          // Cap output on emergency fallback to avoid unexpected long responses.
          const maxTokens = Math.min(
            Number(
              fallbackBody.max_completion_tokens ??
                fallbackBody.max_tokens ??
                fallbackDecision.maxOutputTokens
            ) || fallbackDecision.maxOutputTokens,
            fallbackDecision.maxOutputTokens
          );
          fallbackBody.max_tokens = maxTokens;
          fallbackBody.max_completion_tokens = maxTokens;

          log.warn(
            "EMERGENCY_FALLBACK",
            `${currentModelStr} -> ${fallbackModelStr} | reason=${fallbackDecision.reason}`
          );

          const fallbackResponse = await handleSingleModelChat(
            fallbackBody,
            fallbackModelStr,
            clientRawRequest,
            request,
            comboName,
            apiKeyInfo,
            telemetry,
            { ...runtimeOptions, emergencyFallbackTried: true },
            null, // no strategy for emergency fallback
            Boolean(comboName) // isCombo if comboName exists
          );

          if (fallbackResponse.ok) {
            return fallbackResponse;
          }

          log.warn(
            "EMERGENCY_FALLBACK",
            `Emergency fallback to ${fallbackModelStr} failed with status ${fallbackResponse.status}. Resuming original provider account fallback.`
          );
        }
      }
    }

    // 6. Mark account as quota-exhausted on 429 response
    // For per-model quota providers (Gemini), a 429 on one model doesn't mean
    // the entire account is exhausted — skip connection-wide exhaustion marking.
    if (result.status === 429 && provider !== "gemini") {
      markAccountExhaustedFrom429(credentials.connectionId, provider);
    }

    // 7. Fallback to next account (with optional cooldown-aware same-account retry)
    const fallbackDecision = await markAccountUnavailable(
      credentials.connectionId,
      Number(result.status),
      String(result.error),
      provider,
      model,
      (result.response as Response | undefined)?.headers || null
    );

    const currentAttempt = sameAccountRetryCount;
    if (
      fallbackDecision.shouldFallback &&
      shouldRetryOnCooldown({
        status: Number(result.status),
        cooldownMs: fallbackDecision.cooldownMs,
        retryAttempt: currentAttempt,
        config: retryConfig,
      })
    ) {
      sameAccountRetryCount += 1;
      log.info(
        "COOLDOWN_RETRY",
        `${provider}/${model} waiting ${Math.ceil(fallbackDecision.cooldownMs / 1000)}s before retrying same account`
      );
      await waitForCooldown(fallbackDecision.cooldownMs);
      continue;
    }

    sameAccountRetryCount = 0;

    if (fallbackDecision.shouldFallback) {
      log.warn("AUTH", `Account ${accountId}... unavailable (${result.status}), trying fallback`);
      triedConnectionIds.push(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}

// ──── Pipeline gate checks ────

/**
 * Resolve model string to provider/model info, or return an error response.
 */
async function resolveModelOrError(
  modelStr: string,
  body: Record<string, unknown>,
  endpointPath: string = ""
) {
  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    const modelInfoExt = modelInfo as Record<string, unknown>;
    if (modelInfoExt.errorType === "ambiguous_model") {
      const message =
        (modelInfoExt.errorMessage as string) ||
        `Ambiguous model '${modelStr}'. Use provider/model prefix (ex: gh/${modelStr} or cc/${modelStr}).`;
      log.warn("CHAT", message, {
        model: modelStr,
        candidates:
          (modelInfoExt.candidateAliases as string[]) ||
          (modelInfoExt.candidateProviders as string[]) ||
          [],
      });
      return { error: errorResponse(HTTP_STATUS.BAD_REQUEST, message) };
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return { error: errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format") };
  }

  const { provider, model, extendedContext } = modelInfo;
  const sourceFormat = detectFormatFromEndpoint(body, endpointPath);
  const providerAlias = PROVIDER_ID_TO_ALIAS[provider] || provider;

  // If the custom model specifies apiFormat="responses", override targetFormat
  // to route through the Responses API translator instead of Chat Completions
  let targetFormat = getModelTargetFormat(providerAlias, model) || getTargetFormat(provider);
  const modelInfoExt = modelInfo as Record<string, unknown>;
  if (modelInfoExt.apiFormat === "responses") {
    targetFormat = "openai-responses";
    log.info("ROUTING", `Custom model apiFormat=responses → targetFormat=openai-responses`);
  }

  const ctxTag = extendedContext && providerAlias === "claude" ? " [1m]" : "";
  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}${ctxTag}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}${ctxTag}`);
  }

  return { provider, model, sourceFormat, targetFormat, extendedContext };
}

/**
 * Check pipeline gates: model availability + circuit breaker state.
 * Returns an error Response if blocked, or null if OK to proceed.
 */
function checkPipelineGates(
  provider: string,
  model: string,
  options: { ignoreCircuitBreaker?: boolean; ignoreModelCooldown?: boolean } = {}
) {
  const modelAvailable = isModelAvailable(provider, model);
  if (!modelAvailable && options.ignoreModelCooldown) {
    log.info("AVAILABILITY", `${provider}/${model} cooldown bypassed for combo live test`);
  } else if (!modelAvailable) {
    log.warn("AVAILABILITY", `${provider}/${model} is in cooldown, rejecting request`);
    return (
      unavailableResponse as (status: number, message: string, retryAfter: number) => Response
    )(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      `Model ${provider}/${model} is temporarily unavailable (cooldown)`,
      30
    );
  }

  const breaker = getCircuitBreaker(provider, {
    failureThreshold: 5,
    resetTimeout: 30000,
    onStateChange: (name: string, from: string, to: string) =>
      log.info("CIRCUIT", `${name}: ${from} → ${to}`),
  });
  if (options.ignoreCircuitBreaker && !breaker.canExecute()) {
    log.info("CIRCUIT", `Bypassing OPEN circuit breaker for combo live test: ${provider}`);
  } else if (!breaker.canExecute()) {
    log.warn("CIRCUIT", `Circuit breaker OPEN for ${provider}, rejecting request`);
    return (
      unavailableResponse as (status: number, message: string, retryAfter: number) => Response
    )(HTTP_STATUS.SERVICE_UNAVAILABLE, `Provider ${provider} circuit breaker is open`, 30);
  }

  return null;
}

// ──── Chat execution with circuit breaker ────

/**
 * Execute chat core wrapped in circuit breaker + optional TLS tracking.
 */
async function executeChatWithBreaker({
  bypassCircuitBreaker,
  breaker,
  body,
  requestedModel,
  provider,
  model,
  refreshedCredentials,
  proxyInfo,
  log: logger,
  clientRawRequest,
  credentials,
  apiKeyInfo,
  userAgent,
  comboName,
  comboStrategy,
  isCombo,
  combo,
  extendedContext,
}: {
  bypassCircuitBreaker: boolean;
  breaker: ReturnType<typeof getCircuitBreaker>;
  body: Record<string, unknown>;
  requestedModel: string;
  provider: string;
  model: string;
  refreshedCredentials: Record<string, unknown>;
  proxyInfo: Record<string, unknown> | null;
  log: typeof log;
  clientRawRequest: Record<string, unknown> | null;
  credentials: Record<string, unknown>;
  apiKeyInfo: Record<string, unknown> | null;
  userAgent: string;
  comboName: string | null;
  comboStrategy: string | null;
  isCombo: boolean;
  combo: ComboRecord | null;
  extendedContext?: boolean;
}): Promise<{ result: Record<string, unknown>; tlsFingerprintUsed: boolean }> {
  let _tlsFingerprintUsed = false;

  try {
    const chatFn = () =>
      runWithProxyContext((proxyInfo?.proxy as string) || null, () =>
        (
          handleChatCore as (args: {
            body: Record<string, unknown>;
            modelInfo: { provider: string; model: string; extendedContext?: boolean };
            requestedModelOverride?: string;
            credentials: Record<string, unknown>;
            log: typeof log;
            clientRawRequest: Record<string, unknown> | null;
            connectionId: string;
            apiKeyInfo: Record<string, unknown> | null;
            userAgent: string;
            comboName: string | null;
            comboStrategy: string | null;
            isCombo: boolean;
            combo: ComboRecord | null;
            onCredentialsRefreshed: (newCreds: Record<string, unknown>) => Promise<void>;
            onRequestSuccess: () => Promise<void>;
          }) => Promise<Record<string, unknown>>
        )({
          body: { ...body, model: `${provider}/${model}` },
          modelInfo: { provider, model, extendedContext },
          requestedModelOverride: requestedModel,
          credentials: refreshedCredentials,
          log: logger,
          clientRawRequest,
          connectionId: credentials.connectionId as string,
          apiKeyInfo,
          userAgent,
          comboName,
          comboStrategy,
          isCombo,
          combo,
          onCredentialsRefreshed: async (newCreds: Record<string, unknown>) => {
            await updateProviderCredentials(credentials.connectionId as string, {
              accessToken: newCreds.accessToken,
              refreshToken: newCreds.refreshToken,
              providerSpecificData: newCreds.providerSpecificData,
              testStatus: "active",
            });
          },
          onRequestSuccess: async () => {
            await clearAccountError(credentials.connectionId as string, credentials);
          },
        })
      );

    if (bypassCircuitBreaker) {
      if (!proxyInfo?.proxy && isTlsFingerprintActive()) {
        const tracked = await runWithTlsTracking(chatFn);
        return {
          result: tracked.result as Record<string, unknown>,
          tlsFingerprintUsed: tracked.tlsFingerprintUsed,
        };
      }

      const result = await chatFn();
      return { result: result as Record<string, unknown>, tlsFingerprintUsed: false };
    }

    if (!proxyInfo?.proxy && isTlsFingerprintActive()) {
      const tracked = await breaker.execute(async () => runWithTlsTracking(chatFn));
      return {
        result: tracked.result as Record<string, unknown>,
        tlsFingerprintUsed: tracked.tlsFingerprintUsed,
      };
    }

    const result = await breaker.execute(chatFn);
    return { result: result as Record<string, unknown>, tlsFingerprintUsed: false };
  } catch (cbErr) {
    if (cbErr instanceof CircuitBreakerOpenError) {
      log.warn("CIRCUIT", `${provider} circuit open during retry: ${cbErr.message}`);
      return {
        result: {
          success: false,
          response: (
            unavailableResponse as (status: number, message: string, retryAfter: number) => Response
          )(
            HTTP_STATUS.SERVICE_UNAVAILABLE,
            `Provider ${provider} circuit breaker is open`,
            Math.ceil(cbErr.retryAfterMs / 1000)
          ),
          status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        },
        tlsFingerprintUsed: false,
      };
    }

    // T14: Proxy Fast-Fail should be converted into an upstream-unavailable result
    // so account fallback logic can continue with another connection.
    const cbError = cbErr as { code?: string; message?: string };
    if (
      cbError?.code === "PROXY_UNREACHABLE" ||
      /proxy unreachable/i.test(cbError?.message || "")
    ) {
      const detail = cbError?.message || "Proxy unreachable";
      log.warn("PROXY", detail);
      return {
        result: {
          success: false,
          response: (
            unavailableResponse as (status: number, message: string, retryAfter: number) => Response
          )(HTTP_STATUS.SERVICE_UNAVAILABLE, detail, 2),
          status: HTTP_STATUS.SERVICE_UNAVAILABLE,
          error: detail,
        },
        tlsFingerprintUsed: false,
      };
    }

    throw cbErr;
  }
}

// ──── Extracted helpers (T-28) ────

function handleNoCredentials(
  credentials: Record<string, unknown> | null,
  triedConnectionIds: string[],
  provider: string,
  model: string,
  lastError: string | null,
  lastStatus: number | null
) {
  if (credentials?.allRateLimited) {
    const errorMsg = lastError || credentials.lastError || "Unavailable";
    const status =
      lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
    log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
    return unavailableResponse(
      status,
      `[${provider}/${model}] ${errorMsg}`,
      typeof credentials.retryAfter === "number" || typeof credentials.retryAfter === "string"
        ? credentials.retryAfter
        : undefined,
      typeof credentials.retryAfterHuman === "string" ? credentials.retryAfterHuman : undefined
    );
  }
  if (triedConnectionIds.length === 0) {
    log.error("AUTH", `No credentials for provider: ${provider}`);
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
  }
  // All eligible accounts have been tried and exhausted by transient upstream errors.
  // Adaptively quarantine this provider/model so subsequent requests skip it until it recovers.
  if ([408, 500, 502, 503, 504].includes(Number(lastStatus || 0))) {
    const quarantine = setModelProblematic(provider, model, {
      status: Number(lastStatus || 0),
      reason: `HTTP ${Number(lastStatus || 0)} all accounts exhausted`,
    });
    log.info(
      "AVAILABILITY",
      `${provider}/${model} quarantined for ${Math.ceil(quarantine.cooldownMs / 1000)}s after ${quarantine.failureCount} transient failure(s) across all accounts`
    );
  }
  log.warn("CHAT", "No more accounts available", { provider });
  return errorResponse(
    lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE,
    lastError || "All accounts unavailable"
  );
}

async function safeResolveProxy(connectionId: string): Promise<Record<string, unknown> | null> {
  try {
    return await resolveProxyForConnection(connectionId);
  } catch (proxyErr) {
    const errorMessage = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
    log.debug("PROXY", `Failed to resolve proxy: ${errorMessage}`);
    return null;
  }
}

function safeLogEvents({
  result,
  proxyInfo,
  proxyLatency,
  provider,
  model,
  sourceFormat,
  targetFormat,
  credentials,
  comboName,
  clientRawRequest,
  tlsFingerprintUsed = false,
}: {
  result: Record<string, unknown>;
  proxyInfo: Record<string, unknown> | null;
  proxyLatency: number;
  provider: string;
  model: string;
  sourceFormat: string;
  targetFormat: string;
  credentials: Record<string, unknown>;
  comboName: string | null;
  clientRawRequest: Record<string, unknown> | null;
  tlsFingerprintUsed?: boolean;
}) {
  try {
    logProxyEvent({
      status: (result.success as boolean)
        ? "success"
        : (result.status as number) === 408 || (result.status as number) === 504
          ? "timeout"
          : "error",
      proxy: proxyInfo?.proxy
        ? (proxyInfo.proxy as { type: string; host: string; port: number | string })
        : null,
      level: (proxyInfo?.level as string) || "direct",
      levelId: (proxyInfo?.levelId as string) || null,
      provider,
      targetUrl: `${provider}/${model}`,
      latencyMs: proxyLatency,
      error: (result.success as boolean) ? null : (result.error as string) || null,
      connectionId: credentials.connectionId as string,
      comboId: comboName || null,
      account: (credentials.connectionId as string)?.slice(0, 8) || null,
      tlsFingerprint: tlsFingerprintUsed,
    });
  } catch {}
  try {
    logTranslationEvent({
      provider,
      model,
      sourceFormat,
      targetFormat,
      status: (result.success as boolean) ? "success" : "error",
      statusCode: (result.success as boolean) ? 200 : (result.status as number) || 500,
      latency: proxyLatency,
      endpoint: (clientRawRequest?.endpoint as string) || "/v1/chat/completions",
      connectionId: (credentials.connectionId as string) || null,
      comboName: comboName || null,
    });
  } catch {}
}

function withSessionHeader(response: Response, sessionId: string | null): Response {
  if (!response || !sessionId) return response;

  try {
    response.headers.set("X-Routiform-Session-Id", sessionId);
    response.headers.set("X-Routiform-Session-Id", sessionId);
    return response;
  } catch {
    const cloned = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    cloned.headers.set("X-Routiform-Session-Id", sessionId);
    cloned.headers.set("X-Routiform-Session-Id", sessionId);
    return cloned;
  }
}
