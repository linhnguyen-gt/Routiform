import { checkFallbackError } from "@routiform/open-sse/services/accountFallback.ts";
import { markAccountUnavailable } from "../services/auth";

export interface AccountFallbackDecisionInput {
  /** True when this request came from a test button rather than from a client. */
  isProbe: boolean;
  connectionId: string;
  status: number;
  errorText: string;
  provider: string | null;
  model: string | null;
  headers: Headers | Record<string, string> | null;
}

export interface AccountFallbackDecision {
  shouldFallback: boolean;
  cooldownMs: number;
}

/**
 * What a failed upstream response means for the account that served it.
 *
 * Ordinary traffic records the failure: cooldowns, backoff levels and statuses, so the next
 * request routes around the account. The test buttons run through the same chat path, one
 * request per model, dozens within a second — and a probe that recorded its failure the same
 * way took the whole account out for the cooldown window it had just created, so every model
 * queued behind the first failure returned instantly with the *first* model's error rather
 * than its own. A probe reports its own result and nothing else: it still decides whether
 * another account is worth trying, but it writes nothing and never waits out a cooldown.
 */
export async function resolveAccountFallbackDecision({
  isProbe,
  connectionId,
  status,
  errorText,
  provider,
  model,
  headers,
}: AccountFallbackDecisionInput): Promise<AccountFallbackDecision> {
  if (isProbe) {
    const { shouldFallback } = checkFallbackError(status, errorText, 0, model, provider, headers);
    return { shouldFallback, cooldownMs: 0 };
  }

  return markAccountUnavailable(connectionId, status, errorText, provider, model, headers);
}
