import * as semaphore from "../rateLimitSemaphore.ts";
import { unavailableResponse } from "../../utils/error.ts";
import { resolveComboConfig, getDefaultComboConfig } from "../comboConfig.ts";
import { getCircuitBreaker } from "../../../src/shared/utils/circuitBreaker";
import { parseModel } from "../model.ts";
import { getProviderProfile } from "../accountFallback.ts";
import { resolveNestedComboModels } from "./combo-dag.ts";
import { normalizeModelEntry } from "./combo-model-entry.ts";
import { filterOrderedModelsForToolCalling } from "./combo-tool-calling-filter.ts";
import { resolveRetrySettings } from "./combo-retry-settings.ts";
import { respondComboModelsExhausted } from "./combo-exhausted-responses.ts";
import { releaseOnResponseComplete } from "./combo-release-on-complete.ts";
import { rrCounters } from "./combo-rr-counter.ts";
import { runRoundRobinInnerRetries } from "./combo-rr-inner-retries.ts";

type LogLike = {
  info: (tag: string, msg: string, meta?: unknown) => void;
  warn: (tag: string, msg: string, meta?: unknown) => void;
};

/**
 * Handle round-robin combo: each request goes to the next model in circular order.
 */
export async function handleRoundRobinCombo(options: {
  body: { stream?: boolean; tools?: unknown[] } & Record<string, unknown>;
  combo: {
    name: string;
    models?: unknown[];
    requireToolCalling?: boolean;
    config?: Record<string, unknown>;
  };
  handleSingleModel: (body: unknown, modelStr: string) => Promise<Response>;
  isModelAvailable?: (modelStr: string) => Promise<boolean>;
  log: LogLike;
  settings?: Record<string, unknown>;
  allCombos?: unknown;
}): Promise<Response> {
  const { body, combo, handleSingleModel, isModelAvailable, log, settings, allCombos } = options;
  const models = combo.models || [];
  const config = settings
    ? resolveComboConfig(combo as never, settings)
    : { ...getDefaultComboConfig(), ...(combo.config || {}) };
  const concurrency = (config as { concurrencyPerModel?: number }).concurrencyPerModel ?? 3;
  const queueTimeout = (config as { queueTimeoutMs?: number }).queueTimeoutMs ?? 30000;
  const { maxRetries, retryDelayMs } = resolveRetrySettings(config as Record<string, unknown>);

  // Filter out disabled models first
  const activeModels = models.filter((m) => !normalizeModelEntry(m).disabled);

  let orderedModels: string[];
  if (allCombos) {
    orderedModels = resolveNestedComboModels(
      combo as { name: string; models?: unknown[] },
      allCombos
    );
  } else {
    orderedModels = activeModels.map((m) => normalizeModelEntry(m).model);
  }

  if (orderedModels.length === 0) {
    return unavailableResponse(503, "Round-robin combo has no models");
  }

  let om = filterOrderedModelsForToolCalling(orderedModels, combo, body, log);
  if (om.length === 0) {
    return unavailableResponse(
      400,
      "Combo requireToolCalling: no models in this combo support tool calling for this request"
    );
  }
  orderedModels = om;

  const modelCount = orderedModels.length;

  const counter = rrCounters.get(combo.name) || 0;
  rrCounters.set(combo.name, counter + 1);
  const startIndex = counter % modelCount;

  const startTime = Date.now();
  const state = {
    lastError: null as string | null,
    lastStatus: null as number | null,
    earliestRetryAfter: null as string | null,
    fallbackCount: 0,
  };
  let lastTriedModelIndex: number | null = null;
  let lastTriedModelStr: string | null = null;
  // See the note in `combo-standard-fallback-chain.ts`: only a model that is
  // actually attempted after another attempt counts as a fallback. Skips —
  // breaker, availability, semaphore — never reach an upstream.
  let attemptedAny = false;

  for (let offset = 0; offset < modelCount; offset++) {
    const modelIndex = (startIndex + offset) % modelCount;
    const modelStr = orderedModels[modelIndex];
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

    if (!breaker.canExecute()) {
      log.info("COMBO-RR", `Skipping ${modelStr}: circuit breaker OPEN for ${provider}`);
      continue;
    }

    if (isModelAvailable) {
      const available = await isModelAvailable(modelStr);
      if (!available) {
        log.info("COMBO-RR", `Skipping ${modelStr} (all accounts in cooldown)`);
        continue;
      }
    }

    let release: () => void;
    try {
      release = (await semaphore.acquire(modelStr, {
        maxConcurrency: concurrency,
        timeoutMs: queueTimeout,
      })) as () => void;
    } catch (err: unknown) {
      if (
        (err as { code?: string }).code === "SEMAPHORE_TIMEOUT" ||
        (err as { code?: string }).code === "SEMAPHORE_QUEUE_FULL"
      ) {
        log.warn(
          "COMBO-RR",
          `Semaphore ${(err as { code?: string }).code === "SEMAPHORE_QUEUE_FULL" ? "queue full" : "timeout"} for ${modelStr}, trying next model`
        );
        continue;
      }
      throw err;
    }

    if (attemptedAny) state.fallbackCount++;
    attemptedAny = true;

    let handedOff = false;
    try {
      lastTriedModelIndex = modelIndex;
      lastTriedModelStr = modelStr;
      const direct = await runRoundRobinInnerRetries({
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
        config: config as Record<string, unknown>,
        startTime,
        state,
      });
      if (direct) {
        // The request is not done when the headers are: hand the slot to the
        // response so it lives until the body drains, is cancelled, or errors.
        // Flag only once the handoff actually happened — a throw inside must
        // still fall through to the `finally` release.
        const withSlot = releaseOnResponseComplete(direct, release);
        handedOff = true;
        return withSlot;
      }
    } finally {
      // Every path that does not return a response — advancing to the next
      // model, or throwing — releases here.
      if (!handedOff) release();
    }
  }

  return respondComboModelsExhausted({
    logTag: "COMBO-RR",
    orderedModels,
    combo,
    strategy: "round-robin",
    lastTriedModelIndex,
    lastTriedModelStr,
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    fallbackCount: state.fallbackCount,
    startTime,
    earliestRetryAfter: state.earliestRetryAfter,
    exhaustedDefaultMessage: "All round-robin combo models unavailable",
    log,
  });
}
