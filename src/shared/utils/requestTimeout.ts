/**
 * Request Timeout Utility — FASE-04 Observability
 *
 * Wraps fetch/async calls with configurable timeouts and
 * abort controller support.
 *
 * @module shared/utils/requestTimeout
 */

interface TimeoutOptions {
  timeoutMs?: number;
  label?: string;
  signal?: AbortSignal;
}

export async function fetchWithTimeout(url: string, options: RequestInit & TimeoutOptions = {}) {
  const { timeoutMs = 30000, label = "Request", signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();

  // Merge with external signal if provided
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason));
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if ((error as Error).name === "AbortError" || controller.signal.aborted) {
      const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`) as Error & {
        name: string;
        originalUrl?: string;
        timeoutMs?: number;
      };
      timeoutError.name = "TimeoutError";
      timeoutError.originalUrl = url;
      timeoutError.timeoutMs = timeoutMs;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Execute any async function with a timeout.
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [label='Operation'] - Label for error messages
 * @returns {Promise<T>}
 * @throws {Error} With name 'TimeoutError' if operation times out
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label = "Operation"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs}ms`) as Error & {
        name: string;
        timeoutMs?: number;
      };
      error.name = "TimeoutError";
      error.timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Default provider timeouts (ms).
 */
export const PROVIDER_TIMEOUTS: Record<string, number> = {
  openai: 60000,
  claude: 90000, // Claude can be slower for long outputs
  gemini: 60000,
  codex: 120000, // Coding tasks often take longer
  deepseek: 60000,
  cohere: 45000,
  groq: 30000, // Groq is fast
  mistral: 45000,
  openrouter: 60000,
  default: 60000,
};

export function getProviderTimeout(provider: string): number {
  return PROVIDER_TIMEOUTS[provider] || PROVIDER_TIMEOUTS.default;
}
