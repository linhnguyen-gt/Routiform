/**
 * Shared harness for the combo switching-loop characterization tests.
 *
 * The switching loop is driven entirely through its injected
 * `handleSingleModel` / `handleSingleModelWrapped` callback, so a scripted
 * fake is enough to exercise every branch with no network and no provider
 * credentials.
 */

const { resetAllCircuitBreakers, getCircuitBreaker, STATE } =
  await import("../../src/shared/utils/circuitBreaker.ts");
const { resetAllComboMetrics } = await import("../../open-sse/services/comboMetrics.ts");
const { rrCounters } = await import("../../open-sse/services/combo/combo-rr-counter.ts");
const semaphore = await import("../../open-sse/services/rateLimitSemaphore.ts");
const { _resetAllDecks } = await import("../../src/shared/utils/shuffleDeck.ts");

/** Body of a 200 that passes `validateResponseQuality`. */
export const GOOD_BODY = { choices: [{ message: { content: "hello" } }] };

/**
 * Body of a 200 that fails `validateResponseQuality`.
 *
 * An empty `choices` array is NOT a quality failure — `validateResponseQuality`
 * treats a missing/empty `choices` with no `error` key as valid. A present
 * choice whose message carries neither content nor tool_calls is the real
 * bad-quality shape.
 */
export const BAD_QUALITY_BODY = { choices: [{ message: { content: "" } }] };

function buildResponse(outcome) {
  if (outcome === "ok" || outcome === 200) {
    return new Response(JSON.stringify(GOOD_BODY), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (outcome === "bad-quality") {
    return new Response(JSON.stringify(BAD_QUALITY_BODY), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof outcome === "number") {
    return new Response(JSON.stringify({ error: { message: `Upstream failure ${outcome}` } }), {
      status: outcome,
      statusText: `Error ${outcome}`,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (outcome && typeof outcome === "object") {
    if (outcome.throw) throw new Error(String(outcome.throw));
    const status = outcome.status ?? 200;
    const headers = { "Content-Type": "application/json", ...(outcome.headers || {}) };
    const text =
      typeof outcome.text === "string"
        ? outcome.text
        : JSON.stringify(
            outcome.body ?? (status === 200 ? GOOD_BODY : { error: { message: `Error ${status}` } })
          );
    return new Response(text, {
      status,
      statusText: outcome.statusText ?? (status === 200 ? "OK" : `Error ${status}`),
      headers,
    });
  }
  throw new Error(`Unsupported scripted outcome: ${JSON.stringify(outcome)}`);
}

/**
 * Build a fake `handleSingleModel` from a per-model script.
 *
 * Keyed by model string rather than by call count, so a test states
 * "model A always 429, model B succeeds" and lets the chain decide the order.
 * A value may be a single outcome or an array consumed one entry per attempt
 * (the last entry repeats once exhausted). `"*"` is the fallback key.
 *
 * The returned function carries `.attempts` — the ordered list of
 * `{ modelStr, index }` the chain actually reached.
 */
export function makeScriptedHandler(script) {
  const perModelCalls = new Map();
  const handler = async (_body, modelStr) => {
    const callIndex = perModelCalls.get(modelStr) ?? 0;
    perModelCalls.set(modelStr, callIndex + 1);
    handler.attempts.push({ modelStr, index: handler.attempts.length });

    let outcome = Object.prototype.hasOwnProperty.call(script, modelStr)
      ? script[modelStr]
      : script["*"];
    if (outcome === undefined) {
      throw new Error(`No scripted outcome for model "${modelStr}"`);
    }
    if (Array.isArray(outcome)) {
      outcome = outcome[Math.min(callIndex, outcome.length - 1)];
    }
    return buildResponse(outcome);
  };
  handler.attempts = [];
  /** Model strings in attempt order — the assertion target for ordering tests. */
  handler.order = () => handler.attempts.map((a) => a.modelStr);
  return handler;
}

/** Capture log lines so tests can assert on routing decisions. */
export function makeLog() {
  const entries = [];
  const push = (level) => (tag, msg, meta) => entries.push({ level, tag, msg: String(msg), meta });
  return {
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    entries,
    find: (re) => entries.find((e) => re.test(e.msg)),
    all: (re) => entries.filter((e) => re.test(e.msg)),
  };
}

/** Force a model's combo circuit breaker OPEN. */
export function openBreaker(modelStr, failureThreshold = 3) {
  const breaker = getCircuitBreaker(`combo:${modelStr}`, {
    failureThreshold,
    resetTimeout: 60000,
  });
  breaker.reset();
  for (let i = 0; i < failureThreshold; i++) breaker._onFailure();
  if (breaker.getStatus().state !== STATE.OPEN) {
    throw new Error(`Failed to open breaker for ${modelStr}`);
  }
  return breaker;
}

/**
 * Reset every process-global singleton the switching loop touches.
 *
 * All five already export a reset; no production file grows a test-only hook.
 * If a test turns flaky under reordering, look for a sixth singleton rather
 * than adding a retry.
 */
export function resetComboGlobals() {
  resetAllCircuitBreakers();
  resetAllComboMetrics();
  rrCounters.clear();
  semaphore.resetAll();
  _resetAllDecks();
}

export { semaphore };
