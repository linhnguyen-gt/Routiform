import { getDefaultParams, getForceParams } from "../../config/registry-params.ts";
import { FORMATS } from "../../translator/formats.ts";
import { withRateLimit } from "../../services/rateLimitManager.ts";
import { computeRequestHash, deduplicate, shouldDeduplicate } from "../../services/requestDedup.ts";
import { providerSupportsCaching } from "../../utils/cacheControlPolicy.ts";
import { createStreamController } from "../../utils/streamHandler.ts";
import { resolveExecutorWithProxy } from "../services/upstream-proxy-resolver.ts";
import type { HandlerLogger, JsonRecord, ProviderCredentials } from "../types/chat-core.ts";

export async function createExecuteProviderRequestBundle({
  provider,
  model,
  effectiveModel,
  translatedBody,
  stream,
  upstreamStream,
  credentials,
  nativeCodexPassthrough,
  endpointPath,
  ccSessionId,
  targetFormat,
  connectionId,
  extendedContext,
  log,
  onDisconnect,
  buildUpstreamHeadersForExecute,
}: {
  provider: string;
  model: string;
  effectiveModel: string;
  translatedBody: JsonRecord;
  stream: boolean;
  upstreamStream: boolean;
  credentials: ProviderCredentials;
  nativeCodexPassthrough: boolean;
  endpointPath: string;
  ccSessionId: string | null;
  targetFormat: string;
  connectionId?: string | null;
  extendedContext?: boolean;
  log: HandlerLogger | null | undefined;
  onDisconnect?: () => void;
  buildUpstreamHeadersForExecute: (modelToCall: string) => Record<string, string>;
}) {
  const executor = await resolveExecutorWithProxy({
    provider,
    log,
  });

  const getExecutionCredentials = () => {
    let nextCredentials = nativeCodexPassthrough
      ? { ...credentials, requestEndpointPath: endpointPath }
      : credentials;

    if (ccSessionId) {
      nextCredentials = {
        ...nextCredentials,
        providerSpecificData: {
          ...(nextCredentials?.providerSpecificData || {}),
          ccSessionId,
        },
      };
    }

    if (provider === "xiaomi-mimo-token-plan") {
      return {
        ...nextCredentials,
        providerSpecificData: {
          ...(nextCredentials?.providerSpecificData || {}),
          __routiformTargetFormat: targetFormat,
        },
      };
    }

    return nextCredentials;
  };

  const streamController = createStreamController({ onDisconnect, log, provider, model });

  const dedupRequestBody = { ...translatedBody, model: `${provider}/${model}`, stream };
  const dedupEnabled = shouldDeduplicate(dedupRequestBody);
  const dedupHash = dedupEnabled ? computeRequestHash(dedupRequestBody) : null;

  const executeProviderRequest = async (modelToCall = effectiveModel, allowDedup = false) => {
    const execute = async () => {
      let bodyToSend =
        translatedBody.model === modelToCall
          ? translatedBody
          : { ...translatedBody, model: modelToCall };

      if (
        targetFormat === FORMATS.OPENAI &&
        providerSupportsCaching(provider) &&
        !bodyToSend.prompt_cache_key &&
        Array.isArray(bodyToSend.messages) &&
        !["nvidia", "codex", "xai"].includes(provider)
      ) {
        const { generatePromptCacheKey } = await import("@/lib/promptCache");
        const cacheKey = generatePromptCacheKey(bodyToSend.messages);
        if (cacheKey) {
          bodyToSend = { ...bodyToSend, prompt_cache_key: cacheKey };
        }
      }

      const forceParamModelId = String(bodyToSend.model || modelToCall || "");
      const defaultParams = getDefaultParams(provider, forceParamModelId);
      if (defaultParams) {
        console.log(
          `[DefaultParams] Applying defaults for ${provider}:${forceParamModelId}:`,
          defaultParams
        );
        for (const [key, value] of Object.entries(defaultParams)) {
          if (bodyToSend[key] === undefined) {
            bodyToSend[key] = value;
            console.log(`[DefaultParams] Set ${key} =`, value);
          } else if (
            key === "reasoning" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            bodyToSend[key] &&
            typeof bodyToSend[key] === "object" &&
            !Array.isArray(bodyToSend[key])
          ) {
            // Merge reasoning object: only set effort if not already present
            const existingReasoning = bodyToSend[key] as Record<string, unknown>;
            const defaultReasoning = value as Record<string, unknown>;
            if (existingReasoning.effort === undefined && defaultReasoning.effort !== undefined) {
              existingReasoning.effort = defaultReasoning.effort;
              console.log(`[DefaultParams] Merged reasoning.effort =`, defaultReasoning.effort);
            }
          }
        }
      } else {
        console.log(`[DefaultParams] No defaults found for ${provider}:${forceParamModelId}`);
      }

      const forceParams = getForceParams(provider, forceParamModelId);
      if (forceParams) {
        for (const [key, value] of Object.entries(forceParams)) {
          if (bodyToSend[key] !== value) {
            log?.debug?.(
              "PARAMS",
              `Forcing ${key}=${value} for ${forceParamModelId} (was ${bodyToSend[key]})`
            );
            bodyToSend[key] = value;
          }
        }
      }

      const rawResult = await withRateLimit(
        provider,
        connectionId,
        modelToCall,
        async () => {
          let attempts = 0;
          const maxAttempts = provider === "qwen" ? 3 : 1;

          while (attempts < maxAttempts) {
            const res = await executor.execute({
              model: modelToCall,
              body: bodyToSend,
              stream: upstreamStream,
              credentials: getExecutionCredentials(),
              signal: streamController.signal,
              log,
              extendedContext,
              upstreamExtraHeaders: buildUpstreamHeadersForExecute(modelToCall),
            });

            if (provider === "qwen" && res.response.status === 429 && attempts < maxAttempts - 1) {
              const bodyPeek = await res.response
                .clone()
                .text()
                .catch(() => "");
              if (bodyPeek.toLowerCase().includes("exceeded your current quota")) {
                const delay = 1500 * (attempts + 1);
                log?.warn?.("QWEN_RETRY", `Quota 429 hit. Retrying in ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
                attempts++;
                continue;
              }
            }
            return res;
          }
        },
        // Bypass rate-limiter for combo health-check probes. Probes carry the
        // `X-Internal-Test: combo-health-check` header (set by /api/models/test,
        // /api/combos/test, /api/providers/[id]/test) and must NOT share queue
        // budget with user traffic — otherwise they sit in Bottleneck's queue
        // until the 120s job expiration fires, surfacing as
        // "[502]: This job timed out after 120000 ms" even when the upstream
        // model is healthy.
        {
          bypass:
            buildUpstreamHeadersForExecute(modelToCall)?.["X-Internal-Test"] ===
            "combo-health-check",
        }
      );

      if (stream) return rawResult;

      const status = rawResult.response.status;
      const statusText = rawResult.response.statusText;
      const headers = Array.from(rawResult.response.headers.entries()) as [string, string][];
      const payload = await rawResult.response.text();

      return {
        ...rawResult,
        response: new Response(payload, { status, statusText, headers }),
      };
    };

    if (allowDedup && dedupEnabled && dedupHash) {
      const dedupResult = await deduplicate(dedupHash, execute);
      if (dedupResult.wasDeduplicated) {
        log?.debug?.("DEDUP", `Joined in-flight request hash=${dedupHash}`);
      }
      return dedupResult.result;
    }

    return execute();
  };

  return {
    executor,
    getExecutionCredentials,
    streamController,
    executeProviderRequest,
  };
}
