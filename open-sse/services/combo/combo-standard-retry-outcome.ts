import { checkFallbackError } from "../accountFallback.ts";
import { recordComboRequest } from "../comboMetrics.ts";
import * as semaphore from "../rateLimitSemaphore.ts";
import { validateResponseQuality } from "./combo-response-quality.ts";
import { shouldFallbackComboBadRequest } from "./combo-bad-request-fallback.ts";
import { isAllAccountsRateLimitedResponse } from "./combo-rate-limit-detect.ts";
import { resolveRetryWaitMs } from "./combo-retry-settings.ts";
import { TRANSIENT_FOR_BREAKER } from "./combo-constants.ts";

type LogLike = {
  info: (tag: string, msg: string, meta?: unknown) => void;
  warn: (tag: string, msg: string, meta?: unknown) => void;
};

type BreakerLike = { _onFailure: () => void; _onSuccess: () => void };

/** Statuses eligible for a same-model retry (superset of the breaker list). */
const TRANSIENT_FOR_RETRY = [408, 500, ...TRANSIENT_FOR_BREAKER];

/**
 * Shared handling of transient upstream failures for all combo strategies
 * (standard chain and round-robin). Standard-chain semantics win:
 *   - the circuit breaker records a failure for every TRANSIENT_FOR_BREAKER
 *     status, regardless of any reported cooldown;
 *   - when a cooldown was reported, the semaphore marks the model
 *     rate-limited so fallback ordering skips it while it lasts.
 */
export function applyTransientFailurePenalty(options: {
  modelStr: string;
  status: number;
  cooldownMs: number;
  breaker: BreakerLike;
}) {
  const { modelStr, status, cooldownMs, breaker } = options;
  if (!TRANSIENT_FOR_BREAKER.includes(status)) return;
  breaker._onFailure();
  if (cooldownMs > 0) {
    semaphore.markRateLimited(modelStr, cooldownMs);
  }
}

/** Same-model retry eligibility, shared by all combo strategies. */
export function isTransientComboStatus(status: number): boolean {
  return TRANSIENT_FOR_RETRY.includes(status);
}


/** Successful upstream response: return body, or signal bad 200 quality. */
export async function resolveStandardOkAttempt(options: {
  result: Response;
  body: { stream?: boolean } & Record<string, unknown>;
  log: LogLike;
  breaker: BreakerLike;
  combo: { name: string };
  modelStr: string;
  startTime: number;
  fallbackCount: number;
  strategy: string;
  modelIndex: number;
  provider: string;
  comboIdOrName: string;
}): Promise<{ kind: "return"; response: Response } | { kind: "bad_quality"; reason: string }> {
  const {
    result,
    body,
    log,
    breaker,
    combo,
    modelStr,
    startTime,
    fallbackCount,
    strategy,
    modelIndex,
    provider,
    comboIdOrName,
  } = options;

  const quality = await validateResponseQuality(result, !!body.stream, log);
  if (!quality.valid) {
    log.warn("COMBO", `Model ${modelStr} returned 200 but failed quality check: ${quality.reason}`);
    breaker._onFailure();
    recordComboRequest(combo.name, modelStr, {
      success: false,
      latencyMs: Date.now() - startTime,
      fallbackCount,
      strategy,
      terminalHttpStatus: 200,
      failureModelIndex: modelIndex,
      failureModelStr: modelStr,
    });
    return { kind: "bad_quality", reason: quality.reason || "unknown" };
  }

  const latencyMs = Date.now() - startTime;
  log.info("COMBO", `Model ${modelStr} succeeded (${latencyMs}ms, ${fallbackCount} fallbacks)`);
  breaker._onSuccess();
  recordComboRequest(combo.name, modelStr, {
    success: true,
    latencyMs,
    fallbackCount,
    strategy,
  });

  if (provider) {
    import("../../../src/lib/localDb")
      .then(({ setLKGP }) => setLKGP(combo.name, comboIdOrName, provider))
      .catch((err) =>
        log.warn("COMBO", "Failed to record Last Known Good Provider. This is non-fatal.", { err })
      );
  }

  return { kind: "return", response: result };
}

/** Non-OK upstream: terminal return, same-model retry, or advance to next model. */
export async function resolveStandardNonOkAttempt(options: {
  result: Response;
  /** Raw upstream text — classification and logs only, never the client. */
  errStr: string;
  /** Redacted message safe to return to the caller. */
  clientMessage: string;
  retryAfter: unknown;
  earliestRetryAfter: string | null;
  provider: string;
  combo: { name: string };
  modelStr: string;
  strategy: string;
  orderedModelsLength: number;
  modelIndex: number;
  log: LogLike;
  breaker: BreakerLike;
  startTime: number;
  fallbackCount: number;
  retry: number;
  maxRetries: number;
  retryDelayMs: number;
  config: Record<string, unknown>;
}): Promise<
  | { kind: "terminal"; response: Response }
  | { kind: "retry"; nextDelayMs: number; earliestRetryAfter: string | null }
  | { kind: "next_model"; lastError: string; lastStatus: number; earliestRetryAfter: string | null }
> {
  const {
    result,
    errStr,
    clientMessage,
    retryAfter,
    earliestRetryAfter: prevEarliest,
    provider,
    combo,
    modelStr,
    strategy,
    orderedModelsLength,
    modelIndex,
    log,
    breaker,
    startTime,
    fallbackCount,
    retry,
    maxRetries,
    retryDelayMs,
    config,
  } = options;

  let earliestRetryAfter = prevEarliest;
  if (
    retryAfter &&
    (!earliestRetryAfter || new Date(String(retryAfter)) < new Date(earliestRetryAfter))
  ) {
    earliestRetryAfter = String(retryAfter);
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

  const contentType = result.headers?.get("content-type") ?? null;
  const isAllAccountsRateLimited = isAllAccountsRateLimitedResponse(
    result.status,
    contentType,
    String(errStr)
  );

  applyTransientFailurePenalty({ modelStr, status: result.status, cooldownMs, breaker });

  if (isAllAccountsRateLimited) {
    log.info("COMBO", `All accounts rate-limited for ${modelStr}, falling back to next model`);
  } else if (!shouldFallback && !comboBadRequestFallback) {
    log.warn("COMBO", "Combo routing: terminal error (no fallback to next model)", {
      strategy,
      modelIndex,
      totalModels: orderedModelsLength,
      modelStr,
      terminalStatus: result.status,
    });
    recordComboRequest(combo.name, modelStr, {
      success: false,
      latencyMs: Date.now() - startTime,
      fallbackCount,
      strategy,
      terminalHttpStatus: result.status,
      failureModelIndex: modelIndex,
      failureModelStr: modelStr,
    });
    return { kind: "terminal", response: result };
  }

  if (comboBadRequestFallback) {
    log.info(
      "COMBO",
      `Treating provider-scoped 400 from ${modelStr} as model-local failure; trying next combo target`
    );
  }

  const isTransient = isTransientComboStatus(result.status);
  if (retry < maxRetries && isTransient) {
    return {
      kind: "retry",
      nextDelayMs: resolveRetryWaitMs(retryDelayMs, cooldownMs, config),
      earliestRetryAfter,
    };
  }

  // `lastError` becomes the client-facing message once the chain is exhausted,
  // so it carries the redacted text; the raw body stays in this log line.
  const lastError = clientMessage || String(result.status);
  const lastStatus = result.status;
  log.warn("COMBO", `Model ${modelStr} failed, trying next`, {
    status: result.status,
    upstreamError: errStr,
  });

  if ([502, 503, 504].includes(result.status) && cooldownMs > 0 && cooldownMs <= 5000) {
    log.info("COMBO", `Waiting ${cooldownMs}ms before fallback to next model`);
    await new Promise((r) => setTimeout(r, cooldownMs));
  }

  return {
    kind: "next_model",
    lastError,
    lastStatus,
    earliestRetryAfter,
  };
}
