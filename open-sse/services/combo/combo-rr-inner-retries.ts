import * as semaphore from "../rateLimitSemaphore.ts";
import { checkFallbackError, getProviderProfile } from "../accountFallback.ts";
import { recordComboRequest } from "../comboMetrics.ts";
import { getCircuitBreaker } from "../../../src/shared/utils/circuitBreaker";
import { parseModel } from "../model.ts";
import { shouldFallbackComboBadRequest } from "./combo-bad-request-fallback.ts";
import { isAllAccountsRateLimitedResponse } from "./combo-rate-limit-detect.ts";
import { resolveRetryWaitMs } from "./combo-retry-settings.ts";
import { TRANSIENT_FOR_BREAKER } from "./combo-constants.ts";
import { readUpstreamErrorFromResponse } from "./combo-parse-upstream-error.ts";
import { tryRoundRobinOkResponse } from "./combo-rr-ok-snippet.ts";

type LogLike = {
  info: (tag: string, msg: string, meta?: unknown) => void;
  warn: (tag: string, msg: string, meta?: unknown) => void;
};

type MutableRrState = {
  lastError: string | null;
  lastStatus: number | null;
  earliestRetryAfter: string | null;
  fallbackCount: number;
};

/**
 * Inner retry loop for one round-robin model. Mutates `state` on non-terminal paths.
 * @returns Response to return immediately, or null to proceed to the next offset.
 */
export async function runRoundRobinInnerRetries(options: {
  body: { stream?: boolean } & Record<string, unknown>;
  combo: { name: string };
  modelStr: string;
  modelIndex: number;
  offset: number;
  counter: number;
  modelCount: number;
  handleSingleModel: (body: unknown, modelStr: string) => Promise<Response>;
  log: LogLike;
  maxRetries: number;
  retryDelayMs: number;
  config: Record<string, unknown>;
  startTime: number;
  state: MutableRrState;
}): Promise<Response | null> {
  const {
    body,
    combo,
    modelStr,
    modelIndex,
    offset,
    counter,
    modelCount,
    handleSingleModel,
    log,
    maxRetries,
    retryDelayMs,
    config,
    startTime,
    state,
  } = options;

  const parsed = parseModel(modelStr);
  const provider = parsed.provider || parsed.providerAlias || "unknown";
  const profile = getProviderProfile(provider);
  // Deliberately global per model, not per combo — see the note in
  // `combo-standard-fallback-chain.ts`.
  const breakerKey = `combo:${modelStr}`;
  const breaker = getCircuitBreaker(breakerKey, {
    failureThreshold: profile.circuitBreakerThreshold,
    resetTimeout: profile.circuitBreakerReset,
  });

  let nextRetryDelayMs = retryDelayMs;
  for (let retry = 0; retry <= maxRetries; retry++) {
    if (retry > 0) {
      log.info(
        "COMBO-RR",
        `Retrying ${modelStr} in ${nextRetryDelayMs}ms (attempt ${retry + 1}/${maxRetries + 1})`
      );
      await new Promise((r) => setTimeout(r, nextRetryDelayMs));
    }

    log.info(
      "COMBO-RR",
      `[RR #${counter}] → ${modelStr}${offset > 0 ? ` (fallback +${offset})` : ""}${retry > 0 ? ` (retry ${retry})` : ""}`
    );

    const result = await handleSingleModel(body, modelStr);

    if (result.ok) {
      const okRes = await tryRoundRobinOkResponse({
        result,
        body,
        log,
        breaker,
        combo,
        modelStr,
        startTime,
        fallbackCount: state.fallbackCount,
        modelIndex,
        state,
      });
      if (!okRes) return null;
      return okRes;
    }

    const { errorText, clientMessage, retryAfter } = await readUpstreamErrorFromResponse(result);
    const errStr = errorText;

    if (
      retryAfter &&
      (!state.earliestRetryAfter ||
        new Date(String(retryAfter)) < new Date(state.earliestRetryAfter))
    ) {
      state.earliestRetryAfter = String(retryAfter);
    }

    const { shouldFallback, cooldownMs } = checkFallbackError(
      result.status,
      errStr,
      0,
      null,
      provider,
      result.headers
    );
    const comboBadRequestFallback = shouldFallbackComboBadRequest(result.status, errStr, provider);

    const rrContentType = result.headers?.get("content-type") ?? null;
    const rrIsAllAccountsRateLimited = isAllAccountsRateLimitedResponse(
      result.status,
      rrContentType,
      String(errStr)
    );

    if (TRANSIENT_FOR_BREAKER.includes(result.status) && cooldownMs > 0) {
      semaphore.markRateLimited(modelStr, cooldownMs);
      breaker._onFailure();
      log.warn(
        "COMBO-RR",
        `${modelStr} error ${result.status}, cooldown ${cooldownMs}ms (breaker: ${breaker.getStatus().failureCount}/${profile.circuitBreakerThreshold})`
      );
    }

    if (rrIsAllAccountsRateLimited) {
      log.info("COMBO-RR", `All accounts rate-limited for ${modelStr}, falling back to next model`);
    } else if (!shouldFallback && !comboBadRequestFallback) {
      log.warn("COMBO-RR", "Combo routing (RR): terminal error (no fallback to next model)", {
        comboName: combo.name,
        strategy: "round-robin",
        modelIndex,
        totalModels: modelCount,
        modelStr,
        terminalStatus: result.status,
      });
      recordComboRequest(combo.name, modelStr, {
        success: false,
        latencyMs: Date.now() - startTime,
        fallbackCount: state.fallbackCount,
        strategy: "round-robin",
        terminalHttpStatus: result.status,
        failureModelIndex: modelIndex,
        failureModelStr: modelStr,
      });
      return result;
    }

    if (comboBadRequestFallback) {
      log.info(
        "COMBO-RR",
        `Treating provider-scoped 400 from ${modelStr} as model-local failure; trying next model`
      );
    }

    const isTransient = [408, 429, 500, 502, 503, 504].includes(result.status);
    if (retry < maxRetries && isTransient) {
      nextRetryDelayMs = resolveRetryWaitMs(retryDelayMs, cooldownMs, config);
      continue;
    }

    // Both last-wins, so the exhausted response describes one attempt rather
    // than pairing the first attempt's status with the last one's message.
    // `clientMessage` is the redacted text; the raw body stays in the log line.
    state.lastError = clientMessage || String(result.status);
    state.lastStatus = result.status;
    log.warn("COMBO-RR", `${modelStr} failed, trying next model`, {
      status: result.status,
      upstreamError: errStr,
    });

    if ([502, 503, 504].includes(result.status) && cooldownMs > 0 && cooldownMs <= 5000) {
      log.info("COMBO-RR", `Waiting ${cooldownMs}ms before fallback to next model`);
      await new Promise((r) => setTimeout(r, cooldownMs));
    }

    return null;
  }

  return null;
}
