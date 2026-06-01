import { QODER_QUOTA_USAGE_URL } from "@/lib/qoder/constants";

type QuotaRecord = {
  total: number;
  used: number;
  remaining: number;
  unit: string;
  resetAt: string | null;
};

type QoderUsageOk = {
  quotas: { user: QuotaRecord; organization: QuotaRecord };
  totalUsagePercentage: number;
  isQuotaExceeded: boolean;
  expiresAt: number | null;
};

type QoderUsageMessage = { message: string };

/**
 * Qoder Usage. Hits openapi.qoder.sh/api/v2/quota/usage with a Bearer
 * access token (no COSY signing needed for this endpoint). Surfaces
 * user + organization quotas plus the absolute reset timestamp.
 */
export async function getQoderUsage(
  accessToken: string | undefined
): Promise<QoderUsageOk | QoderUsageMessage> {
  if (!accessToken) {
    return { message: "Qoder usage unavailable: no access token" };
  }
  try {
    // globalThis.fetch is patched by open-sse/utils/proxyFetch.ts to honor
    // the ambient runWithProxyContext when present.
    const response = await fetch(QODER_QUOTA_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      return { message: `Qoder connected. Usage fetch returned ${response.status}.` };
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return { message: "Qoder connected. Usage response was not JSON." };
    }
    // Quota records live under `quotas`; scalar metadata
    // (totalUsagePercentage, isQuotaExceeded, expiresAt) are surfaced as
    // siblings so the dashboard parser doesn't try to render them as rows.
    const userQuota = (body.userQuota || {}) as Record<string, unknown>;
    const orgQuota = (body.orgResourcePackage || {}) as Record<string, unknown>;
    // Qoder publishes a single absolute reset timestamp (`expiresAt` in ms);
    // surface it on every quota record as ISO so the table can render
    // "resets at" alongside used/total.
    const expiresAtRaw = Number(body.expiresAt);
    const expiresAtMs = Number.isFinite(expiresAtRaw) && expiresAtRaw > 0 ? expiresAtRaw : null;
    const resetAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
    const quotas = {
      user: {
        total: Number(userQuota.total) || 0,
        used: Number(userQuota.used) || 0,
        remaining: Number(userQuota.remaining) || 0,
        unit: typeof userQuota.unit === "string" ? userQuota.unit : "credits",
        resetAt,
      },
      organization: {
        total: Number(orgQuota.total) || 0,
        used: Number(orgQuota.used) || 0,
        remaining: Number(orgQuota.remaining) || 0,
        unit: typeof orgQuota.unit === "string" ? orgQuota.unit : "credits",
        resetAt,
      },
    };
    return {
      quotas,
      totalUsagePercentage: Number(body.totalUsagePercentage) || 0,
      isQuotaExceeded: !!body.isQuotaExceeded,
      expiresAt: expiresAtMs,
    };
  } catch (error: unknown) {
    const m = error instanceof Error ? error.message : String(error);
    return { message: `Qoder connected. Unable to fetch usage: ${m}` };
  }
}

/**
 * @deprecated Kept for back-compat with callers that imported `getIflowUsage`
 * for Qoder. New code should call `getQoderUsage` directly.
 */
export const getIflowUsage = getQoderUsage;
