/**
 * Runtime projectId resolution (loadCodeAssist + onboardUser).
 *
 * Antigravity OAuth normally stores a
 * projectId during postExchange, but stale/empty values surface as a hard 422
 * from transformRequest. Resolving at runtime turns those into auto-recovery
 * instead of forcing the user to "reconnect OAuth".
 *
 * @module executors/antigravity/project-resolver
 */
import {
  buildProjectResolutionHeaders,
  extractCloudCodeProject,
  extractDefaultTierId,
  onboardManagedProject,
  type LoadCodeAssistResponse,
} from "./project-onboarding.ts";
import type { AntigravityLog } from "./types.ts";

const LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const LOAD_CODE_ASSIST_TIMEOUT_MS = 10_000;
const PROJECT_TTL_MS = 30_000;
const MAX_PROJECT_CACHE_SIZE = 100;
const PROJECT_LOAD_METADATA = Object.freeze({
  ideType: "IDE_UNSPECIFIED",
  platform: "PLATFORM_UNSPECIFIED",
  pluginType: "GEMINI",
});

const antigravityProjectCache = new Map<string, { projectId: string; expiresAt: number }>();
const antigravityInflightProjectRefresh = new Map<string, Promise<string | null>>();

/** Evict expired entries, then the oldest one, when the cache is full. */
function pruneProjectCache(): void {
  if (antigravityProjectCache.size < MAX_PROJECT_CACHE_SIZE) return;

  const now = Date.now();
  for (const [key, val] of antigravityProjectCache) {
    if (val.expiresAt <= now) antigravityProjectCache.delete(key);
  }
  if (antigravityProjectCache.size >= MAX_PROJECT_CACHE_SIZE) {
    const firstKey = antigravityProjectCache.keys().next().value;
    if (firstKey !== undefined) antigravityProjectCache.delete(firstKey);
  }
}

async function doResolveAntigravityProject(
  accessToken: string,
  log?: AntigravityLog
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOAD_CODE_ASSIST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(LOAD_CODE_ASSIST_URL, {
        method: "POST",
        headers: buildProjectResolutionHeaders(accessToken),
        body: JSON.stringify({ metadata: PROJECT_LOAD_METADATA }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      log?.warn?.("AG_LOAD_CODE_ASSIST", `${response.status} — falling back to stored projectId`);
      return null;
    }

    const data = (await response.json().catch(() => ({}))) as LoadCodeAssistResponse;
    let projectId = extractCloudCodeProject(data);
    const tierId = extractDefaultTierId(data);

    if (!projectId) {
      log?.debug?.("AG_LOAD_CODE_ASSIST", "no cloudaicompanionProject — attempting onboardUser");
    }

    // Always run onboardUser when project is missing OR tier needs activation.
    // Accounts that just signed up have an empty `cloudaicompanionProject` until
    // onboardUser completes.
    const onboarded = await onboardManagedProject(accessToken, tierId, projectId, log);
    if (onboarded) projectId = onboarded;

    if (!projectId) {
      log?.warn?.("AG_LOAD_CODE_ASSIST", "could not resolve project — falling back");
      return null;
    }

    pruneProjectCache();
    antigravityProjectCache.set(accessToken, {
      projectId,
      expiresAt: Date.now() + PROJECT_TTL_MS,
    });

    return projectId;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log?.warn?.("AG_LOAD_CODE_ASSIST", `failed (${msg}) — falling back to stored projectId`);
    return null;
  }
}

/**
 * Resolve the Cloud Code project for an access token.
 * Cached for {@link PROJECT_TTL_MS}; concurrent callers share one in-flight refresh.
 */
export async function resolveAntigravityProject(
  accessToken: string,
  log?: AntigravityLog
): Promise<string | null> {
  if (!accessToken) return null;

  const cached = antigravityProjectCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) return cached.projectId;

  const inflight = antigravityInflightProjectRefresh.get(accessToken);
  if (inflight) return inflight;

  const promise = doResolveAntigravityProject(accessToken, log);
  antigravityInflightProjectRefresh.set(accessToken, promise);
  try {
    return await promise;
  } finally {
    antigravityInflightProjectRefresh.delete(accessToken);
  }
}
