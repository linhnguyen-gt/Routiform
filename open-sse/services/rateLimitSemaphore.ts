/**
 * Rate-Limit Semaphore
 *
 * Per-model concurrency limiter with FIFO queue for round-robin combo strategy.
 * When a model is at max concurrency, requests wait in a queue instead of failing.
 * When a model hits rate-limits, it's temporarily paused and queued requests wait.
 *
 * The concurrency limit is NOT stored on the gate. It travels with each
 * acquisition, so a caller can only ever cap *itself*: an acquisition admits
 * only while the model's total in-flight count is below the number that
 * acquisition asked for. It does not hold anyone else down — a limit-1 caller's
 * live request will not stop a limit-20 caller from reaching 20 on the same
 * model. What that buys is order-independence: the outcome no longer depends on
 * who acquired most recently, and `markRateLimited` — which knows nothing about
 * anyone's configuration — can no longer reset a 20-slot gate to the default 3.
 *
 * The rate-limit cooldown, by contrast, IS shared per model: a provider 429
 * applies to that model everywhere, so partitioning it per combo would let one
 * combo keep hammering a model another combo has already been throttled on.
 *
 * All state is in-memory — resets on server restart (by design, since rate-limit
 * windows are typically short-lived).
 */

/**
 * @typedef {Object} ModelGate
 * @property {number} running - Currently running requests
 * @property {Array<{resolve: Function, reject: Function, timer: NodeJS.Timeout, maxConcurrency: number}>} queue - FIFO wait queue
 * @property {number|null} rateLimitedUntil - Timestamp when rate-limit expires (null = not limited)
 */

/** @type {Map<string, ModelGate>} */
const gates = new Map();

const DEFAULT_MAX_QUEUE_SIZE = 20;
const DEFAULT_MAX_CONCURRENCY = 3;

/**
 * Get or create gate for a model.
 * @param {string} modelStr
 * @returns {ModelGate}
 */
function getGate(modelStr) {
  if (!gates.has(modelStr)) {
    gates.set(modelStr, {
      running: 0,
      queue: [],
      rateLimitedUntil: null,
    });
  }
  return gates.get(modelStr);
}

/**
 * Check if a model is currently rate-limited
 * @param {ModelGate} gate
 * @returns {boolean}
 */
function isRateLimited(gate) {
  if (!gate.rateLimitedUntil) return false;
  if (Date.now() >= gate.rateLimitedUntil) {
    gate.rateLimitedUntil = null;
    return false;
  }
  return true;
}

/**
 * Try to drain queued requests when slots become available.
 *
 * Stops at the head waiter when its own limit is not satisfied rather than
 * looking further down the queue: skipping ahead to a waiter with a higher
 * limit would let permissive callers starve restrictive ones indefinitely and
 * break the FIFO guarantee this module documents.
 *
 * @param {string} modelStr
 */
function drainQueue(modelStr) {
  const gate = gates.get(modelStr);
  if (!gate) return;

  while (gate.queue.length > 0 && !isRateLimited(gate)) {
    const next = gate.queue[0];
    if (gate.running >= next.maxConcurrency) break;
    gate.queue.shift();
    clearTimeout(next.timer);
    gate.running++;
    next.resolve(createReleaseFn(modelStr));
  }
}

/**
 * Create a release function for a slot
 * @param {string} modelStr
 * @returns {Function}
 */
function createReleaseFn(modelStr) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const gate = gates.get(modelStr);
    if (gate && gate.running > 0) {
      gate.running--;
      drainQueue(modelStr);
    }
  };
}

/**
 * Acquire a concurrency slot for a model.
 * If slots are available and model is not rate-limited, resolves immediately.
 * Otherwise waits in a FIFO queue until a slot opens or timeout expires.
 *
 * `maxConcurrency` caps the total number of in-flight requests on this model
 * that this acquisition is willing to coexist with. It is not stored anywhere,
 * so no other caller can raise or lower it.
 *
 * @param {string} modelStr - The model identifier
 * @param {Object} [options]
 * @param {number} [options.maxConcurrency=3] - Max concurrent requests for this model
 * @param {number} [options.timeoutMs=30000] - Max wait time in queue
 * @param {number} [options.maxQueueSize=20] - Max queue size before rejecting
 * @returns {Promise<Function>} Release function — MUST be called when done
 * @throws {Error} If queue timeout expires ("SEMAPHORE_TIMEOUT")
 * @throws {Error} If queue is full ("SEMAPHORE_QUEUE_FULL")
 */
export function acquire(
  modelStr,
  {
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    timeoutMs = 30000,
    maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  } = {}
) {
  const gate = getGate(modelStr);

  // Fast path: slot available and not rate-limited
  if (gate.running < maxConcurrency && !isRateLimited(gate)) {
    gate.running++;
    return Promise.resolve(createReleaseFn(modelStr));
  }

  if (gate.queue.length >= maxQueueSize) {
    const err = new Error(`Semaphore queue full (${maxQueueSize}) for ${modelStr}`) as Error & {
      code?: string;
    };
    err.code = "SEMAPHORE_QUEUE_FULL";
    return Promise.reject(err);
  }

  // Slow path: enqueue and wait
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove from queue on timeout
      const idx = gate.queue.findIndex((item) => item.timer === timer);
      if (idx !== -1) gate.queue.splice(idx, 1);
      const err = new Error(`Semaphore timeout after ${timeoutMs}ms for ${modelStr}`) as Error & {
        code?: string;
      };
      err.code = "SEMAPHORE_TIMEOUT";
      reject(err);
      // The departing waiter may have been the one blocking the drain: since
      // each waiter carries its own limit, the head has the strictest one, and
      // removing it can make everything behind it eligible. Nothing else would
      // wake them — a release only fires when a running request finishes.
      if (idx === 0) drainQueue(modelStr);
    }, timeoutMs);

    gate.queue.push({ resolve, reject, timer, maxConcurrency });
  });
}

/**
 * Mark a model as rate-limited for a given duration.
 * Existing running requests continue, but new acquisitions are blocked
 * until the cooldown expires. After expiry, the queue drains automatically.
 *
 * @param {string} modelStr - The model identifier
 * @param {number} cooldownMs - How long to block (milliseconds)
 */
export function markRateLimited(modelStr, cooldownMs) {
  const gate = getGate(modelStr);
  gate.rateLimitedUntil = Date.now() + cooldownMs;

  // Schedule drain after cooldown expires
  setTimeout(() => {
    if (gate.rateLimitedUntil && Date.now() >= gate.rateLimitedUntil) {
      gate.rateLimitedUntil = null;
      drainQueue(modelStr);
    }
  }, cooldownMs + 50); // +50ms buffer
}

/**
 * Get stats for all tracked models (for monitoring/UI).
 *
 * There is no `max` field: the limit belongs to each acquisition, not to the
 * gate, so the only limit that exists at any moment is the head waiter's.
 *
 * @returns {Object} Map of modelStr → { running, queued, queuedMax, rateLimitedUntil }
 */
export function getStats() {
  const stats = {};
  for (const [model, gate] of gates) {
    stats[model] = {
      running: gate.running,
      queued: gate.queue.length,
      queuedMax: gate.queue.length > 0 ? gate.queue[0].maxConcurrency : null,
      rateLimitedUntil: gate.rateLimitedUntil
        ? new Date(gate.rateLimitedUntil).toISOString()
        : null,
    };
  }
  return stats;
}

/**
 * Reset all gates (for testing)
 */
export function resetAll() {
  for (const [, gate] of gates) {
    for (const item of gate.queue) {
      clearTimeout(item.timer);
      item.reject(new Error("Semaphore reset"));
    }
  }
  gates.clear();
}
