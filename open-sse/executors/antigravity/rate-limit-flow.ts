/**
 * 429/503 handling for the Antigravity executor: works out how long to wait
 * (headers → error body → 4-tier classifier), optionally burns Google One AI
 * credits, then plans the next loop action.
 *
 * @module executors/antigravity/rate-limit-flow
 */
import { HTTP_STATUS } from "../../config/constants.ts";
import { classify429, decide429, type Decision } from "../../services/antigravity429Engine.ts";
import { shouldRetryWithCredits } from "../../services/antigravityCredits.ts";
import { isCreditsEnabled, retryWithCredits, type CreditsRetryContext } from "./credits-retry.ts";
import {
  LONG_RETRY_THRESHOLD_MS,
  MAX_AUTO_RETRIES,
  MAX_RETRY_AFTER_MS,
  parseRetryFromErrorMessage,
  parseRetryHeaders,
} from "./retry-policy.ts";
import type { AntigravityLog, ExecutorResult } from "./types.ts";

export type RateLimitContext = CreditsRetryContext & { response: Response };

export type RateLimitResolution = {
  retryMs: number | null;
  /** Present when the credits retry produced a final result. Intentionally not awaited here. */
  result?: Promise<ExecutorResult>;
};

/**
 * Determine the retry delay for a rate-limited response.
 * Header value wins; otherwise the error message is parsed, then classified.
 * Quota exhaustion may short-circuit into a Google One AI credits retry.
 */
export async function resolveRateLimitRetry(ctx: RateLimitContext): Promise<RateLimitResolution> {
  // Try to get retry time from headers first
  const headerRetryMs = parseRetryHeaders(ctx.response.headers);
  if (headerRetryMs) return { retryMs: headerRetryMs };

  let retryMs: number | null = null;

  // If no retry time in headers, try to parse from the error message body
  try {
    const errorBody = await ctx.response.clone().text();
    const errorJson = JSON.parse(errorBody) as { error?: { message?: string }; message?: string };
    const errorMessage = errorJson?.error?.message || errorJson?.message || "";
    retryMs = parseRetryFromErrorMessage(errorMessage);

    if (!retryMs) {
      // 4-tier 429 classification engine (matching CLIProxyAPI)
      const category = classify429(errorMessage);
      const decision: Decision = decide429(category, retryMs);
      retryMs = decision.retryAfterMs;
      ctx.log?.debug?.(
        "AG_429",
        `Category: ${category}, Decision: ${decision.kind} — ${decision.reason}`
      );

      // For quota_exhausted, attempt Google One AI credits retry
      if (
        category === "quota_exhausted" &&
        shouldRetryWithCredits(ctx.accessToken, isCreditsEnabled())
      ) {
        const credits = await retryWithCredits(ctx);
        if (credits) return { retryMs, result: credits.result };
      }
    }
  } catch {
    // Ignore parse errors, will fall back to exponential backoff
  }

  return { retryMs };
}

export type RateLimitAction =
  | { kind: "wait-and-retry"; waitMs: number }
  | { kind: "next-url" }
  | { kind: "return-upstream" }
  | { kind: "fallthrough" };

export type RateLimitPlanInput = {
  status: number;
  retryMs: number | null;
  stream: boolean;
  urlIndex: number;
  fallbackCount: number;
  /** Mutated in place when an auto-retry is consumed (matches the pre-refactor loop). */
  retryAttemptsByUrl: Record<number, number>;
  log?: AntigravityLog;
};

export type RateLimitOutcome =
  | { kind: "result"; result: Promise<ExecutorResult> }
  | { kind: "wait-and-retry"; waitMs: number }
  | { kind: "next-url" }
  | { kind: "return-upstream" }
  | { kind: "fallthrough"; retryMs: number | null };

/**
 * Full 429/503 handling for one execute-loop iteration: resolve the delay
 * (possibly returning a credits-retry result) then plan the next action.
 */
export async function handleRateLimitedResponse(
  ctx: RateLimitContext & Omit<RateLimitPlanInput, "status" | "retryMs">
): Promise<RateLimitOutcome> {
  const resolution = await resolveRateLimitRetry(ctx);
  if (resolution.result) return { kind: "result", result: resolution.result };

  const action = planRateLimitAction({
    status: ctx.response.status,
    retryMs: resolution.retryMs,
    stream: ctx.stream,
    urlIndex: ctx.urlIndex,
    fallbackCount: ctx.fallbackCount,
    retryAttemptsByUrl: ctx.retryAttemptsByUrl,
    log: ctx.log,
  });

  return action.kind === "fallthrough"
    ? { kind: "fallthrough", retryMs: resolution.retryMs }
    : action;
}

/** Decide what the execute loop should do next after a rate-limited response. */
export function planRateLimitAction(input: RateLimitPlanInput): RateLimitAction {
  const { status, retryMs, stream, urlIndex, fallbackCount, retryAttemptsByUrl, log } = input;
  const hasFallbackLeft = urlIndex + 1 < fallbackCount;

  if (retryMs && retryMs <= LONG_RETRY_THRESHOLD_MS) {
    const effectiveRetryMs = Math.min(retryMs, MAX_RETRY_AFTER_MS);
    if (stream) {
      log?.debug?.(
        "RETRY",
        `${status} with Retry-After: ${Math.ceil(effectiveRetryMs / 1000)}s on stream request, skipping wait and trying fallback`
      );
      // No fallback nodes left: return the upstream response immediately instead
      // of stalling stream requests on Retry-After waits.
      return hasFallbackLeft ? { kind: "next-url" } : { kind: "return-upstream" };
    }
    log?.debug?.(
      "RETRY",
      `${status} with Retry-After: ${Math.ceil(effectiveRetryMs / 1000)}s, waiting...`
    );
    return { kind: "wait-and-retry", waitMs: effectiveRetryMs };
  }

  // Auto retry only for 429 when retryMs is 0 or undefined
  if (
    !stream &&
    status === HTTP_STATUS.RATE_LIMITED &&
    !retryMs &&
    retryAttemptsByUrl[urlIndex] < MAX_AUTO_RETRIES
  ) {
    retryAttemptsByUrl[urlIndex]++;
    // Exponential backoff: 2s, 4s, 8s...
    const backoffMs = Math.min(1000 * 2 ** retryAttemptsByUrl[urlIndex], MAX_RETRY_AFTER_MS);
    log?.debug?.(
      "RETRY",
      `429 auto retry ${retryAttemptsByUrl[urlIndex]}/${MAX_AUTO_RETRIES} after ${backoffMs / 1000}s`
    );
    return { kind: "wait-and-retry", waitMs: backoffMs };
  }

  log?.debug?.(
    "RETRY",
    `${status}, Retry-After ${retryMs ? `too long (${Math.ceil(retryMs / 1000)}s)` : "missing"}, trying fallback`
  );
  return hasFallbackLeft ? { kind: "next-url" } : { kind: "fallthrough" };
}
