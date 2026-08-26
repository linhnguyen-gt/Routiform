import { ANTIGRAVITY_CONFIG } from "./antigravity-config.ts";

// ── Antigravity subscription info cache ──────────────────────────────────────
// Prevents duplicate loadCodeAssist calls within the same quota cycle.
// Key: truncated accessToken → { data, fetchedAt }
const _antigravitySubCache = new Map();
const ANTIGRAVITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get Antigravity subscription info (cached, 5 min TTL)
 * Prevents duplicate loadCodeAssist calls within the same quota cycle.
 */
export async function getAntigravitySubscriptionInfoCached(accessToken) {
  const cacheKey = accessToken.substring(0, 16);
  const cached = _antigravitySubCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < ANTIGRAVITY_CACHE_TTL_MS) {
    return cached.data;
  }

  // Delete-on-stale-read: access tokens rotate, so each rotation leaves a
  // dead entry keyed by a token prefix (which embeds the bearer token).
  // Dropping the stale entry on read keeps the map bounded instead of
  // accumulating rotated-token entries forever.
  if (cached) _antigravitySubCache.delete(cacheKey);

  const data = await getAntigravitySubscriptionInfo(accessToken);
  _antigravitySubCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

/**
 * Get Antigravity subscription info using correct Antigravity headers.
 * Must match the headers used in providers.js postExchange (not CLI headers).
 */
async function getAntigravitySubscriptionInfo(accessToken) {
  try {
    const response = await fetch(ANTIGRAVITY_CONFIG.loadProjectApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "google-api-nodejs-client/9.15.1",
        "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
        "Client-Metadata": JSON.stringify({
          ideType: "IDE_UNSPECIFIED",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        }),
      },
      body: JSON.stringify({
        metadata: {
          ideType: "IDE_UNSPECIFIED",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        },
      }),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}
