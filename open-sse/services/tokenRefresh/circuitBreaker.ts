interface CircuitBreakerStatusEntry {
  failures: number;
  blocked: boolean;
  blockedUntil: string | null;
  remainingMs: number;
}

interface RefreshLoggerLike {
  error?: (scope: string, message: string) => void;
  warn?: (scope: string, message: string) => void;
}

// Keyed per CONNECTION, not per provider. A provider-wide key meant one revoked refresh token
// blocked every other account of that provider for the full cooldown — an operator running four
// Claude connections lost all four because one died.
const _circuitBreaker: Record<string, { failures: number; blockedUntil: number }> = {};
const CIRCUIT_BREAKER_THRESHOLD = 5; // consecutive failures before tripping
const CIRCUIT_BREAKER_COOLDOWN = 30 * 60 * 1000; // 30 minutes

/**
 * Breaker key for a connection.
 *
 * An absent connection id falls back to the provider-wide key rather than to no key at all: it
 * degrades to the old behaviour, which is safe, instead of letting a caller escape the breaker,
 * which is not.
 */
function getBreakerKey(provider: string, connectionId?: string | null): string {
  return connectionId ? `${provider}:${connectionId}` : provider;
}

/**
 * Check if a connection is circuit-breaker blocked.
 */
export function isProviderBlocked(provider: string, connectionId?: string | null): boolean {
  const key = getBreakerKey(provider, connectionId);
  const state = _circuitBreaker[key];
  if (!state) return false;
  if (state.blockedUntil > Date.now()) return true;

  // Cooldown expired — reset. Guarded on `blockedUntil > 0`, which is the difference between
  // "this connection served its 30 minutes" and "this connection has failed a few times and has
  // not tripped yet". The unguarded delete wiped the consecutive-failure counter on every check,
  // and since every refresh checks before it records, the count could never get past 1 — the
  // threshold of 5 was unreachable and the breaker could not trip at all.
  if (state.blockedUntil > 0) delete _circuitBreaker[key];
  return false;
}

/**
 * Get circuit breaker status for every tracked connection (for diagnostics).
 *
 * Keys are `provider:connectionId`, or a bare provider when the caller had no connection id.
 */
export function getCircuitBreakerStatus(): Record<string, CircuitBreakerStatusEntry> {
  const result: Record<string, CircuitBreakerStatusEntry> = {};
  for (const [key, state] of Object.entries(_circuitBreaker)) {
    result[key] = {
      failures: state.failures,
      blocked: state.blockedUntil > Date.now(),
      blockedUntil:
        state.blockedUntil > Date.now() ? new Date(state.blockedUntil).toISOString() : null,
      remainingMs: Math.max(0, state.blockedUntil - Date.now()),
    };
  }
  return result;
}

/**
 * Record a successful refresh — resets the circuit breaker for that connection only.
 */
function recordSuccess(provider: string, connectionId?: string | null) {
  const key = getBreakerKey(provider, connectionId);
  if (_circuitBreaker[key]) {
    delete _circuitBreaker[key];
  }
}

/**
 * Record a failed refresh — increments circuit breaker counter.
 */
function recordFailure(
  provider: string,
  log: RefreshLoggerLike | null = null,
  connectionId?: string | null
) {
  const key = getBreakerKey(provider, connectionId);
  if (!_circuitBreaker[key]) {
    _circuitBreaker[key] = { failures: 0, blockedUntil: 0 };
  }
  _circuitBreaker[key].failures++;

  if (_circuitBreaker[key].failures >= CIRCUIT_BREAKER_THRESHOLD) {
    _circuitBreaker[key].blockedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
    // `key` is provider + connection id. Neither is credential material.
    log?.error?.(
      "TOKEN_REFRESH",
      `🔴 Circuit breaker tripped for ${key}: ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures. ` +
        `Blocked for ${CIRCUIT_BREAKER_COOLDOWN / 60000}min. This connection needs re-authentication.`
    );
  }
}

export { getBreakerKey, recordSuccess, recordFailure };
export type { CircuitBreakerStatusEntry, RefreshLoggerLike };
