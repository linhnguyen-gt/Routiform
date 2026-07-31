/**
 * Fallback/retry loop for Antigravity requests.
 *
 * Extracted from the executor class so the orchestration (URL fallback,
 * rate-limit backoff, SSE collection for non-streaming clients) stays readable
 * and independently testable. The executor is passed in as a small runtime
 * interface, preserving method overrides.
 *
 * @module executors/antigravity/execute-loop
 */
import { HTTP_STATUS } from "../../config/constants.ts";
import { mergeUpstreamExtraHeaders } from "../base.ts";
import { cacheRemainingCredits } from "./credits-retry.ts";
import { handleRateLimitedResponse } from "./rate-limit-flow.ts";
import { embedRetryAfterMs, LONG_RETRY_THRESHOLD_MS } from "./retry-policy.ts";
import type { AntigravityExecuteInput, AntigravityRuntime, ExecutorResult } from "./types.ts";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimitedOrUnavailable(status: number): boolean {
  return status === HTTP_STATUS.RATE_LIMITED || status === HTTP_STATUS.SERVICE_UNAVAILABLE;
}

export async function executeAntigravityRequest(
  executor: AntigravityRuntime,
  { model, body, stream, credentials, signal, log, upstreamExtraHeaders }: AntigravityExecuteInput
): Promise<ExecutorResult> {
  const fallbackCount = executor.getFallbackCount();
  let lastError: unknown = null;
  let lastStatus = 0;
  const retryAttemptsByUrl: Record<number, number> = {}; // Track retry attempts per URL

  // Always stream upstream — buildUrl always returns the streaming endpoint.
  // For non-streaming clients, we collect the SSE below and return a synthetic
  // non-streaming Response so chatCore's non-streaming path stays unchanged.
  const upstreamStream = true;

  // Account ID for credits-exhausted tracking.
  // Key must match getAntigravityUsage() in fetcher.ts (providerSpecificData?.email || sub).
  // credentials.email and credentials.sub are populated from the same OAuth token store,
  // so the cache keys written here and read in the fetcher will always match.
  const accountId: string = credentials?.email || credentials?.sub || "unknown";
  const accessToken: string = credentials?.accessToken || "";

  for (let urlIndex = 0; urlIndex < fallbackCount; urlIndex++) {
    const url = executor.buildUrl(model, upstreamStream, urlIndex);
    const headers = executor.buildHeaders(credentials, upstreamStream);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);

    const transformResult = await executor.transformRequest(
      model,
      body,
      upstreamStream,
      credentials,
      log
    );
    if (transformResult instanceof Response) {
      return { response: transformResult, url, headers, transformedBody: body };
    }
    const transformedBody: Record<string, unknown> = transformResult;

    // Initialize retry counter for this URL
    if (!retryAttemptsByUrl[urlIndex]) {
      retryAttemptsByUrl[urlIndex] = 0;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(transformedBody),
        signal,
      });

      let retryMs: number | null = null;

      if (isRateLimitedOrUnavailable(response.status)) {
        const outcome = await handleRateLimitedResponse({
          response,
          url,
          headers,
          transformedBody,
          stream,
          signal,
          accessToken,
          log,
          urlIndex,
          fallbackCount,
          retryAttemptsByUrl,
          collectStream: (creditsResp, creditsBody) =>
            executor.collectStreamToResponse(
              creditsResp,
              model,
              url,
              headers,
              creditsBody,
              log,
              signal
            ),
        });

        // Returned unawaited on purpose: a rejection from the collector must
        // surface to the caller, not be swallowed by this loop's catch block.
        if (outcome.kind === "result") return outcome.result;

        if (outcome.kind === "wait-and-retry") {
          await delay(outcome.waitMs);
          urlIndex--;
          continue;
        }

        lastStatus = response.status;
        if (outcome.kind === "return-upstream") {
          return { response, url, headers, transformedBody };
        }
        if (outcome.kind === "next-url") continue;
        retryMs = outcome.retryMs; // "fallthrough" — handle as a normal response below
      }

      if (executor.shouldRetry(response.status, urlIndex)) {
        log?.debug?.("RETRY", `${response.status} on ${url}, trying fallback ${urlIndex + 1}`);
        lastStatus = response.status;
        continue;
      }

      // If we have a 429 with a long retry time, embed it in the response body
      if (
        response.status === HTTP_STATUS.RATE_LIMITED &&
        retryMs &&
        retryMs > LONG_RETRY_THRESHOLD_MS
      ) {
        const modified = await embedRetryAfterMs(response, retryMs, log);
        if (modified) return { response: modified, url, headers, transformedBody };
      }

      // For non-streaming clients, collect the SSE stream and return a synthetic
      // non-streaming Response so chatCore doesn't need to handle SSE conversion.
      if (!stream && response.ok) {
        const collected = await executor.collectStreamToResponse(
          response,
          model,
          url,
          headers,
          transformedBody,
          log,
          signal
        );
        // Parse _remainingCredits from the synthetic response and cache it
        await cacheRemainingCredits(collected.response, accountId);
        return collected;
      }

      return { response, url, headers, transformedBody };
    } catch (error) {
      lastError = error;
      if (urlIndex + 1 < fallbackCount) {
        log?.debug?.("RETRY", `Error on ${url}, trying fallback ${urlIndex + 1}`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`All ${fallbackCount} URLs failed with status ${lastStatus}`);
}
