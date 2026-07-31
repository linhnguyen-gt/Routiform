/**
 * Cloud Code `onboardUser` support for runtime projectId resolution.
 *
 * Accounts that just signed up have an empty `cloudaicompanionProject` until
 * onboarding completes, so the resolver always polls this endpoint when the
 * project is missing or the tier still needs activation.
 *
 * @module executors/antigravity/project-onboarding
 */
import { antigravityUserAgent, googApiClientHeader } from "../../services/antigravityHeaders.ts";
import type { AntigravityLog } from "./types.ts";

const ONBOARD_USER_URL = "https://cloudcode-pa.googleapis.com/v1internal:onboardUser";
const ONBOARD_TIMEOUT_MS = 10_000;
const ONBOARD_DELAY_MS = 5_000;
const ONBOARD_ATTEMPTS = 3;
const DEFAULT_ONBOARD_TIER = "free-tier";
const ONBOARD_METADATA = Object.freeze({
  ideType: "IDE_UNSPECIFIED",
  pluginType: "GEMINI",
});

export type LoadCodeAssistResponse = {
  cloudaicompanionProject?: string | { id?: string };
  allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
};

export type OnboardResponse = {
  done?: boolean;
  managedProjectId?: string;
  defaultTierId?: string;
  response?: { cloudaicompanionProject?: string | { id?: string } };
};

export function extractCloudCodeProject(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const proj = (payload as LoadCodeAssistResponse).cloudaicompanionProject;
  if (typeof proj === "string") return proj.trim();
  if (proj && typeof proj === "object" && typeof proj.id === "string") return proj.id.trim();
  return "";
}

export function extractDefaultTierId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return DEFAULT_ONBOARD_TIER;
  const data = payload as LoadCodeAssistResponse & OnboardResponse;
  if (Array.isArray(data.allowedTiers)) {
    for (const tier of data.allowedTiers) {
      if (tier?.isDefault && typeof tier.id === "string" && tier.id.trim()) {
        return tier.id.trim();
      }
    }
  }
  if (typeof data.defaultTierId === "string" && data.defaultTierId.trim()) {
    return data.defaultTierId.trim();
  }
  return DEFAULT_ONBOARD_TIER;
}

export function buildProjectResolutionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": antigravityUserAgent(),
    "X-Goog-Api-Client": googApiClientHeader(),
    "Client-Metadata": `{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}`,
  };
}

/**
 * Poll `onboardUser` until it reports `done` with a managed project.
 * Returns the resolved projectId, or null when onboarding never completes.
 */
export async function onboardManagedProject(
  accessToken: string,
  tierId: string,
  initialProjectId: string,
  log?: AntigravityLog
): Promise<string | null> {
  // Up to 3 polls — onboarding may return done=false initially.
  let resolved = initialProjectId || "";
  for (let i = 0; i < ONBOARD_ATTEMPTS; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, ONBOARD_DELAY_MS));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ONBOARD_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(ONBOARD_USER_URL, {
          method: "POST",
          headers: buildProjectResolutionHeaders(accessToken),
          body: JSON.stringify({
            tierId,
            metadata: ONBOARD_METADATA,
            ...(resolved ? { cloudaicompanionProject: resolved } : {}),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        log?.warn?.("AG_ONBOARD", `attempt ${i + 1}/${ONBOARD_ATTEMPTS} → ${response.status}`);
        continue;
      }

      const data = (await response.json().catch(() => ({}))) as OnboardResponse;
      const respProject = extractCloudCodeProject(data.response || {});
      if (respProject) resolved = respProject;
      if (data.managedProjectId && typeof data.managedProjectId === "string") {
        resolved = data.managedProjectId.trim() || resolved;
      }
      if (data.done === true && resolved) return resolved;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log?.warn?.("AG_ONBOARD", `attempt ${i + 1}/${ONBOARD_ATTEMPTS} error: ${msg}`);
    }
  }

  return resolved || null;
}
