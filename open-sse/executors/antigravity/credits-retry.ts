/**
 * Google One AI credits fallback for quota-exhausted Antigravity accounts.
 *
 * @module executors/antigravity/credits-retry
 */
import { HTTP_STATUS } from "../../config/constants.ts";
import {
  handleCreditsFailure,
  injectCreditsField,
  updateAntigravityRemainingCredits,
} from "../../services/antigravityCredits.ts";
import type { AntigravityLog, ExecutorResult } from "./types.ts";

export type CreditsRetryContext = {
  url: string;
  headers: Record<string, string>;
  transformedBody: Record<string, unknown>;
  stream: boolean;
  signal?: AbortSignal | null;
  accessToken: string;
  log?: AntigravityLog;
  /** Collect an SSE response into a non-streaming result (used for stream=false clients). */
  collectStream: (response: Response, body: Record<string, unknown>) => Promise<ExecutorResult>;
};

export function isCreditsEnabled(): boolean {
  return process.env.ANTIGRAVITY_CREDITS === "1" || process.env.ANTIGRAVITY_CREDITS === "true";
}

/**
 * Re-send the request with the Google One AI credits field injected.
 *
 * Returns a wrapper holding the *pending* result promise rather than an awaited
 * value: the caller must not swallow a rejection coming from the collector, so
 * the promise is passed through unawaited.
 */
export async function retryWithCredits(
  ctx: CreditsRetryContext
): Promise<{ result: Promise<ExecutorResult> } | null> {
  const { url, headers, transformedBody, stream, signal, accessToken, log } = ctx;

  log?.info?.("AG_CREDITS", "Retrying with Google One AI credits");
  const creditsBody = injectCreditsField(transformedBody);

  try {
    const creditsResp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(creditsBody),
      signal,
    });

    if (creditsResp.ok || creditsResp.status !== HTTP_STATUS.RATE_LIMITED) {
      log?.info?.("AG_CREDITS", `Credits retry succeeded: ${creditsResp.status}`);
      if (!stream) {
        return { result: ctx.collectStream(creditsResp, creditsBody) };
      }
      return {
        result: Promise.resolve({
          response: creditsResp,
          url,
          headers,
          transformedBody: creditsBody,
        }),
      };
    }

    handleCreditsFailure(accessToken);
    log?.warn?.("AG_CREDITS", "Credits retry also 429'd");
  } catch (creditsErr) {
    handleCreditsFailure(accessToken);
    log?.warn?.("AG_CREDITS", `Credits retry failed: ${creditsErr}`);
  }

  return null;
}

/**
 * Cache the Google One AI credit balance advertised in a collected response.
 * Best-effort — never throws.
 */
export async function cacheRemainingCredits(
  syntheticResponse: Response,
  accountId: string
): Promise<void> {
  try {
    const syntheticJson = (await syntheticResponse.clone().json()) as {
      _remainingCredits?: Array<{ creditType?: string; creditAmount?: string }>;
    };
    const rc = syntheticJson?._remainingCredits;
    if (!Array.isArray(rc)) return;

    const googleCredit = rc.find((c) => c.creditType === "GOOGLE_ONE_AI");
    if (!googleCredit) return;

    const balance = parseInt(String(googleCredit.creditAmount), 10);
    if (!isNaN(balance)) {
      updateAntigravityRemainingCredits(accountId, balance);
    }
  } catch {
    /* balance reporting is best-effort */
  }
}
