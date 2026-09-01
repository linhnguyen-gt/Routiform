import { toNumber, toRecord } from "./json-helpers.ts";
import type { UsageQuota } from "./types.ts";

/**
 * Ollama Cloud subscription quota.
 *
 * Ollama exposes no usage/quota API (verified against docs.ollama.com on
 * 2026-08-31: unauthenticated probe of /api/usage returns 401, /api/user/plans
 * and /api/rate-limits return 404). The only surface that shows Cloud Usage
 * is the signed-in dashboard page https://ollama.com/settings, reached with
 * the user's session cookie — same approach as CodexBar's OllamaUsageFetcher
 * (Sources/CodexBarCore/Providers/Ollama).
 *
 * The page is parsed for three fragments:
 *   - plan badge after the "Cloud Usage" heading
 *   - "Session usage" / "Weekly usage" labels + "N% used" (fallback: bar width)
 *   - data-time ISO timestamps for the "Resets in ..." elements
 *
 * Auth must arrive via connection.providerSpecificData.settingsCookie (a
 * Cookie header string captured from the browser's Network tab). API keys
 * (Bearer auth) intentionally do NOT work here; ollama.com redirects signed-
 * out requests to /signin.
 *
 * Like every sibling usage service, failures return `{ message }` instead of
 * throwing: src/lib/usage/providerLimits.ts matches auth-failure wording
 * ("unauthorized", "token expired") to mark dead connections as expired, so
 * a scraping failure must never use that wording.
 */

const SETTINGS_URL = "https://ollama.com/settings";
const REQUEST_TIMEOUT_MS = 15_000;
const OLLAMA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function getOllamaUsageCookie(providerSpecificData?: unknown): string {
  const psd = toRecord(providerSpecificData);
  const raw = psd.settingsCookie;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  // Accept a bare cookie value pasted without the "name=" part.
  if (trimmed && !trimmed.includes("=")) return `session=${trimmed}`;
  return trimmed;
}

export async function getOllamaCloudUsage(providerSpecificData?: Record<string, unknown>) {
  const cookie = getOllamaUsageCookie(providerSpecificData);

  if (!cookie) {
    return {
      message:
        "No Ollama session cookie configured. Open ollama.com/settings in a browser, copy the Cookie header from the Network tab, and paste it into this connection's settings.",
    };
  }

  let res: Response;
  try {
    res = await fetch(SETTINGS_URL, {
      headers: {
        Cookie: cookie,
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": OLLAMA_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://ollama.com/",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return { message: "Ollama Cloud usage fetch failed (network error or timeout)" };
  }

  const finalUrl = new URL(res.url);
  const isSignInRedirect =
    finalUrl.hostname.startsWith("signin.") || finalUrl.pathname.startsWith("/signin");
  if (res.redirected && isSignInRedirect) {
    return {
      message:
        "Ollama session cookie expired. Re-copy the Cookie header from a signed-in ollama.com/settings tab and update this connection.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      message: `Ollama session cookie rejected (HTTP ${res.status}). Re-copy the cookie.`,
    };
  }
  if (!res.ok) {
    return { message: `Ollama settings page returned HTTP ${res.status}` };
  }

  const html = await res.text();
  const snapshot = parseOllamaSettingsHtml(html);

  if (!snapshot) {
    return {
      message: "Could not parse Ollama usage from the settings page (page layout may have changed)",
    };
  }

  const quotas: Record<string, UsageQuota> = {};
  if (snapshot.sessionUsedPercent !== null) {
    quotas["session"] = {
      used: snapshot.sessionUsedPercent,
      total: 100,
      remaining: Math.max(0, 100 - snapshot.sessionUsedPercent),
      remainingPercentage: Math.max(0, 100 - snapshot.sessionUsedPercent),
      resetAt: snapshot.sessionResetsAt,
      unlimited: false,
    };
  }
  if (snapshot.weeklyUsedPercent !== null) {
    quotas["weekly"] = {
      used: snapshot.weeklyUsedPercent,
      total: 100,
      remaining: Math.max(0, 100 - snapshot.weeklyUsedPercent),
      remainingPercentage: Math.max(0, 100 - snapshot.weeklyUsedPercent),
      resetAt: snapshot.weeklyResetsAt,
      unlimited: false,
    };
  }

  if (Object.keys(quotas).length === 0) {
    return { plan: snapshot.plan, quotas, message: "No usage windows published yet" };
  }
  return { plan: snapshot.plan, quotas };
}

interface OllamaParsedUsage {
  plan: string;
  sessionUsedPercent: number | null;
  weeklyUsedPercent: number | null;
  sessionResetsAt: string | null;
  weeklyResetsAt: string | null;
}

/**
 * Parse the signed-in settings page. Exported for regression tests against a
 * captured HTML fixture: update the fixture when ollama.com changes layout.
 */
export function parseOllamaSettingsHtml(html: string): OllamaParsedUsage | null {
  const plan = parsePlanName(html);
  const allLabels = ["Session usage", "Hourly usage", "Weekly usage"];
  const session = parseUsageBlock(html, ["Session usage", "Hourly usage"], allLabels);
  const weekly = parseUsageBlock(html, ["Weekly usage"], allLabels);

  if (!session && !weekly) return null;

  return {
    plan: plan || "Unknown",
    sessionUsedPercent: session?.usedPercent ?? null,
    weeklyUsedPercent: weekly?.usedPercent ?? null,
    sessionResetsAt: session?.resetsAt ?? null,
    weeklyResetsAt: weekly?.resetsAt ?? null,
  };
}

interface UsageBlock {
  usedPercent: number;
  resetsAt: string | null;
}

function parseUsageBlock(
  html: string,
  labels: string[],
  boundaryLabels: string[]
): UsageBlock | null {
  for (const label of labels) {
    const labelIndex = html.indexOf(label);
    if (labelIndex === -1) continue;

    const tail = html.slice(labelIndex + label.length);
    const window = usageBlockWindow(boundaryLabels, label, tail);
    const usedPercent = parsePercent(window);
    if (usedPercent === null) continue;

    return { usedPercent, resetsAt: parseIsoDate(window) };
  }
  return null;
}

function usageBlockWindow(labels: string[], label: string, tail: string): string {
  const MAX_WINDOW = 4000;
  let end = MAX_WINDOW;
  for (const other of labels) {
    if (other === label) continue;
    const idx = tail.indexOf(other);
    if (idx !== -1) end = Math.min(end, idx);
  }
  return tail.slice(0, end);
}

function parsePercent(text: string): number | null {
  const usedMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*used/i);
  if (usedMatch) {
    const value = toNumber(usedMatch[1], NaN);
    if (Number.isFinite(value)) return value;
  }
  const widthMatch = text.match(/width:\s*([0-9]+(?:\.[0-9]+)?)%/i);
  if (widthMatch) {
    const value = toNumber(widthMatch[1], NaN);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseIsoDate(text: string): string | null {
  const match = text.match(/data-time="([^"]+)"/);
  if (!match) return null;
  const ms = Date.parse(match[1]);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function parsePlanName(html: string): string | null {
  const match = html.match(/Cloud Usage\s*<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
  if (!match) return null;
  const trimmed = match[1].trim();
  return trimmed || null;
}
