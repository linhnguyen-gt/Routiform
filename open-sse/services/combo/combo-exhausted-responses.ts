import { formatRetryAfter } from "../accountFallback.ts";
import { unavailableResponse } from "../../utils/error.ts";
import { getCircuitBreaker } from "../../../src/shared/utils/circuitBreaker";
import { recordComboRequest } from "../comboMetrics.ts";

type LogWarn = (tag: string, msg: string, meta?: unknown) => void;

export async function respondComboModelsExhausted(options: {
  logTag: "COMBO" | "COMBO-RR";
  orderedModels: string[];
  combo: { name: string; id?: string };
  strategy: string;
  lastTriedModelIndex: number | null;
  lastTriedModelStr: string | null;
  lastStatus: number | null;
  lastError: string | null;
  fallbackCount: number;
  startTime: number;
  earliestRetryAfter: string | null;
  exhaustedDefaultMessage: string;
  log: { warn: LogWarn };
}): Promise<Response> {
  const {
    logTag,
    orderedModels,
    combo,
    strategy,
    lastTriedModelIndex,
    lastTriedModelStr,
    lastStatus,
    lastError,
    fallbackCount,
    startTime,
    earliestRetryAfter,
    exhaustedDefaultMessage,
    log,
  } = options;

  const latencyMs = Date.now() - startTime;
  const exhaustedMsg =
    logTag === "COMBO-RR"
      ? "Combo routing (RR): all models exhausted"
      : "Combo routing: all models exhausted";
  log.warn(logTag, exhaustedMsg, {
    comboName: combo.name,
    strategy,
    lastModelIndex: lastTriedModelIndex,
    lastModelStr: lastTriedModelStr,
    terminalStatus: lastStatus,
    totalModels: orderedModels.length,
    fallbackCount,
  });
  recordComboRequest(combo.name, null, {
    success: false,
    latencyMs,
    fallbackCount,
    strategy,
    terminalHttpStatus: lastStatus ?? null,
    failureModelIndex: lastTriedModelIndex,
    failureModelStr: lastTriedModelStr,
  });

  const allBreakersOpen = orderedModels.every((m) => {
    // Deliberately global per model, not per combo — see the note in
    // `combo-standard-fallback-chain.ts`.
    return !getCircuitBreaker(`combo:${m}`).canExecute();
  });

  if (allBreakersOpen) {
    log.warn(logTag, "All models have circuit breaker OPEN — aborting");
    return unavailableResponse(
      503,
      "All providers temporarily unavailable (circuit breakers open)"
    );
  }

  if (lastStatus === null && !lastError) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Service temporarily unavailable: all upstream accounts are inactive",
          type: "service_unavailable",
          code: "ALL_ACCOUNTS_INACTIVE",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (lastStatus === null && lastError) {
    log.warn(logTag, "Combo exhausted without terminal HTTP status (quality or upstream gap)", {
      lastError,
      lastTriedModelStr,
    });
    return new Response(
      JSON.stringify({
        error: {
          message: lastError,
          type: "api_error",
          code: "COMBO_MODELS_EXHAUSTED",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const status = lastStatus as number;
  const msg = lastError || exhaustedDefaultMessage;
  const exhaustedStatus = status === 402 || status === 403 || status === 429 ? 503 : status;

  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn(logTag, `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(exhaustedStatus, msg, earliestRetryAfter, retryHuman);
  }

  log.warn(logTag, `All models failed | ${msg}`);
  return new Response(JSON.stringify({ error: { message: msg } }), {
    status: exhaustedStatus,
    headers: { "Content-Type": "application/json" },
  });
}
