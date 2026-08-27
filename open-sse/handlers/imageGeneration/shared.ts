import { saveCallLog } from "@/lib/usageDb";
export function normalizeRequestedImageCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

export function createSingleImageBody(body) {
  return {
    ...body,
    n: 1,
  };
}

export function createImageFanoutError(provider, delivered, requested, message) {
  return {
    success: false,
    status: 502,
    error: `${provider} image fanout failed after ${delivered}/${requested} successful request(s): ${message}`,
  };
}
/**
 * Bounded, generic client-facing error for an image provider failure.
 * Raw upstream error text must never reach clients; callers persist it
 * server-side via saveCallLog instead (see handlers/search.ts for the pattern).
 */
export function imageProviderErrorResponse(provider, status) {
  return {
    success: false,
    status,
    error: `Image provider ${provider} failed (${status})`,
  };
}
// Upstream fetch timeouts (ms) so hung providers cannot block requests indefinitely.
// Env-overridable; defaults are generous relative to existing poll budgets.
export const IMAGE_SUBMIT_TIMEOUT_MS = normalizePositiveNumber(
  process.env.IMAGE_SUBMIT_TIMEOUT_MS,
  180000
);
export const IMAGE_POLL_FETCH_TIMEOUT_MS = normalizePositiveNumber(
  process.env.IMAGE_POLL_FETCH_TIMEOUT_MS,
  30000
);
export const IMAGE_DOWNLOAD_TIMEOUT_MS = normalizePositiveNumber(
  process.env.IMAGE_DOWNLOAD_TIMEOUT_MS,
  60000
);
export const LOCAL_IMAGE_TIMEOUT_MS = normalizePositiveNumber(
  process.env.LOCAL_IMAGE_TIMEOUT_MS,
  600000
);
export async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
export async function saveImageCallLog({
  provider,
  model,
  status,
  duration,
  requestBody,
  responseImagesCount,
  error,
  metadata,
}: {
  provider: string;
  model: string;
  status: number;
  duration: number;
  requestBody: unknown;
  responseImagesCount?: number;
  error?: string;
  metadata?: unknown;
}) {
  return saveCallLog({
    method: "POST",
    path: "/v1/images/generations",
    status,
    model: `${provider}/${model}`,
    provider,
    duration,
    tokens: { prompt_tokens: 0, completion_tokens: 0 },
    error: typeof error === "string" ? error.slice(0, 500) : null,
    requestBody,
    responseBody:
      typeof responseImagesCount === "number"
        ? {
            images_count: responseImagesCount,
            ...(metadata && typeof metadata === "object" ? metadata : {}),
          }
        : null,
  }).catch(() => {});
}
export function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
