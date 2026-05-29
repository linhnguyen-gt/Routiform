import { safePercentage } from "@/shared/utils/formatting";
import { toRecord } from "./json-helpers.ts";
import { parseResetTime } from "./reset-time.ts";
import type { JsonRecord } from "./types.ts";
import type { UsageQuota } from "./types.ts";

const CLAUDE_CONFIG = {
  oauthUsageUrl: "https://api.anthropic.com/api/oauth/usage",
  usageUrl: "https://api.anthropic.com/v1/organizations/{org_id}/usage",
  settingsUrl: "https://api.anthropic.com/v1/settings",
  apiVersion: "2023-06-01",
};

function normalizeClaudePlanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractClaudePlanLabel(data: JsonRecord): string | null {
  const directCandidates = [
    data.tier,
    data.plan,
    data.plan_type,
    data.planType,
    data.subscription_type,
    data.subscriptionType,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeClaudePlanValue(candidate);
    if (normalized) return normalized;
  }

  const subscription = toRecord(data.subscription);
  const subscriptionCandidates = [
    subscription.type,
    subscription.plan,
    subscription.tier,
    subscription.subscription_type,
    subscription.subscriptionType,
  ];

  for (const candidate of subscriptionCandidates) {
    const normalized = normalizeClaudePlanValue(candidate);
    if (normalized) return normalized;
  }

  const account = toRecord(data.account);
  const accountCandidates = [
    account.plan,
    account.tier,
    account.plan_type,
    account.planType,
    account.subscription_type,
    account.subscriptionType,
  ];

  for (const candidate of accountCandidates) {
    const normalized = normalizeClaudePlanValue(candidate);
    if (normalized) return normalized;
  }

  return null;
}

async function fetchClaudeSettingsPlan(accessToken: string): Promise<string | null> {
  const settingsResponse = await fetch(CLAUDE_CONFIG.settingsUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "anthropic-version": CLAUDE_CONFIG.apiVersion,
    },
  });

  if (!settingsResponse.ok) {
    return null;
  }

  const settings = await settingsResponse.json();
  return extractClaudePlanLabel(toRecord(settings));
}

/**
 * Claude Usage - Try to fetch from Anthropic API
 */
export async function getClaudeUsage(accessToken) {
  try {
    // Primary: Try OAuth usage endpoint (works with Claude Code consumer OAuth tokens)
    // Requires anthropic-beta: oauth-2025-04-20 header
    const oauthResponse = await fetch(CLAUDE_CONFIG.oauthUsageUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": CLAUDE_CONFIG.apiVersion,
      },
    });

    if (oauthResponse.ok) {
      const data = await oauthResponse.json();
      const quotas: Record<string, UsageQuota> = {};

      // utilization = percentage USED (e.g., 90 means 90% used, 10% remaining)
      // Confirmed via user report #299: Claude.ai shows 87% used = Routiform must show 13% remaining.
      const hasUtilization = (window: JsonRecord) =>
        window && typeof window === "object" && safePercentage(window.utilization) !== undefined;

      const createQuotaObject = (window: JsonRecord) => {
        const used = safePercentage(window.utilization) as number; // utilization = % used
        const remaining = Math.max(0, 100 - used);
        return {
          used,
          total: 100,
          remaining,
          resetAt: parseResetTime(window.resets_at),
          remainingPercentage: remaining,
          unlimited: false,
        };
      };

      if (hasUtilization(data.five_hour)) {
        quotas["session (5h)"] = createQuotaObject(data.five_hour);
      }

      if (hasUtilization(data.seven_day)) {
        quotas["weekly (7d)"] = createQuotaObject(data.seven_day);
      }

      // Parse model-specific weekly windows (e.g., seven_day_sonnet, seven_day_opus)
      for (const [key, value] of Object.entries(data)) {
        const valueRecord = toRecord(value);
        if (key.startsWith("seven_day_") && key !== "seven_day" && hasUtilization(valueRecord)) {
          const modelName = key.replace("seven_day_", "");
          quotas[`weekly ${modelName} (7d)`] = createQuotaObject(valueRecord);
        }
      }

      // Try to extract plan tier from the OAuth response
      const planRaw =
        extractClaudePlanLabel(toRecord(data)) || (await fetchClaudeSettingsPlan(accessToken));

      return {
        plan: planRaw,
        quotas,
        extraUsage: data.extra_usage ?? null,
      };
    }

    // Fallback: OAuth endpoint returned non-OK, try legacy settings/org endpoint
    console.warn(
      `[Claude Usage] OAuth endpoint returned ${oauthResponse.status}, falling back to legacy`
    );
    return await getClaudeUsageLegacy(accessToken);
  } catch (error) {
    return { message: `Claude connected. Unable to fetch usage: ${(error as Error).message}` };
  }
}

/**
 * Legacy Claude usage fetcher for API key / org admin users.
 * Uses /v1/settings + /v1/organizations/{org_id}/usage endpoints.
 */
async function getClaudeUsageLegacy(accessToken) {
  try {
    const settingsResponse = await fetch(CLAUDE_CONFIG.settingsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-version": CLAUDE_CONFIG.apiVersion,
      },
    });

    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      const plan = extractClaudePlanLabel(toRecord(settings));

      if (settings.organization_id) {
        const usageResponse = await fetch(
          CLAUDE_CONFIG.usageUrl.replace("{org_id}", settings.organization_id),
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "anthropic-version": CLAUDE_CONFIG.apiVersion,
            },
          }
        );

        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          return {
            plan,
            organization: settings.organization_name,
            quotas: usage,
          };
        }
      }

      return {
        plan,
        organization: settings.organization_name,
        message: "Claude connected. Usage details require admin access.",
      };
    }

    return { message: "Claude connected. Usage API requires admin permissions." };
  } catch (error) {
    return { message: `Claude connected. Unable to fetch usage: ${(error as Error).message}` };
  }
}
