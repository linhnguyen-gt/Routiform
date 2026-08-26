import { toNumber, toRecord } from "./json-helpers.ts";
import type { UsageQuota } from "./types.ts";

/**
 * Grok / xAI subscription quota.
 *
 * xAI exposes no public /v1/usage endpoint, but the SuperGrok OAuth token
 * Routiform already stores for provider "xai" is accepted by the Grok CLI's
 * billing proxy (endpoint and header conventions per CodexBar's
 * GrokCreditsProxyFetcher):
 *
 *   GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
 *   Authorization: Bearer <accessToken>
 *   x-xai-token-auth: xai-grok-cli
 *
 * Like every sibling usage service, failures return `{ message }` instead of
 * throwing: src/lib/usage/providerLimits.ts matches auth-failure wording
 * ("unauthorized", "re-authenticate") to mark dead connections as expired.
 */

const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const REQUEST_TIMEOUT_MS = 15_000;

function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function formatPlanLabel(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function getXaiUsage(accessToken?: string) {
  if (!accessToken) {
    return {
      plan: "Unknown",
      quotas: {} as Record<string, UsageQuota>,
      message: "unauthorized: no SuperGrok access token — please re-authenticate",
    };
  }

  let res: Response;
  try {
    res = await fetch(BILLING_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-xai-token-auth": "xai-grok-cli",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return {
      plan: "Unknown",
      quotas: {} as Record<string, UsageQuota>,
      message: "xAI billing API unreachable",
    };
  }

  if (!res.ok) {
    const message =
      res.status === 401 || res.status === 403
        ? "unauthorized: invalid or expired SuperGrok token — please re-authenticate"
        : `xAI billing API error (${res.status})`;
    return { plan: "Unknown", quotas: {} as Record<string, UsageQuota>, message };
  }

  const json = toRecord(await res.json());
  const config = toRecord(json.config);
  const planRaw =
    (typeof config.subscriptionTier === "string" && config.subscriptionTier) ||
    (typeof json.subscriptionTier === "string" && json.subscriptionTier) ||
    "";
  const plan = planRaw ? formatPlanLabel(planRaw) : "Unknown";

  const periodEnd = parseIsoDate(toRecord(config.currentPeriod).end);
  const resetAt = periodEnd ?? parseIsoDate(config.billingPeriodEnd);

  // Prefer the provider-reported percentage; fall back to on-demand cap math.
  let usedPercent = toNumber(config.creditUsagePercent, NaN);
  if (!Number.isFinite(usedPercent)) {
    const cap = toNumber(toRecord(config.onDemandCap).val, 0);
    const used = toNumber(toRecord(config.onDemandUsed).val, 0);
    usedPercent = cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : NaN;
  }

  let quotas: Record<string, UsageQuota> = {};
  if (Number.isFinite(usedPercent)) {
    const used = Math.min(100, Math.max(0, usedPercent));
    const remaining = Math.max(0, 100 - used);
    quotas = {
      credits: {
        used,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt,
        unlimited: false,
        displayName: "Credits",
      },
    };
  }

  // When no percentage is derivable the card still shows plan + reset window
  // via the message path used by other providers with partial data.
  if (Object.keys(quotas).length === 0) {
    return { plan, quotas, message: resetAt ? "Resets at window end" : undefined };
  }
  return { plan, quotas };
}
