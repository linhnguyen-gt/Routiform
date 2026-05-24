import { googApiClientHeader } from "@routiform/open-sse/services/antigravityHeaders.ts";
import { getAntigravityApiUserAgent } from "@routiform/open-sse/services/usage/antigravity-config.ts";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { resolveProxyForProvider } from "@/lib/localDb";
import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { ANTIGRAVITY_CONFIG } from "@/lib/oauth/constants/oauth";

export type AntigravityLiveModel = {
  id: string;
  name: string;
  quotaInfo?: {
    remainingFraction?: number | string;
    resetTime?: string;
    isExhausted?: boolean;
  };
};

type AntigravityConnectionLike = {
  id?: string;
  provider?: string;
  accessToken?: string;
  projectId?: string;
  providerSpecificData?: unknown;
  priority?: number;
  isActive?: boolean;
};

type AntigravityProxy = Awaited<ReturnType<typeof resolveProxyForProvider>>;

const ANTIGRAVITY_NON_CHAT_MODEL_IDS = new Set([
  "gemini-2.5-flash-thinking",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3-pro-low",
  "gemini-3-pro-high",
]);

/**
 * fetchAvailableModels currently exposes both user-facing tier rows and some
 * duplicate/raw backend rows. Keep the friendly tier rows visible in the UI and
 * hide only the raw duplicates that are known to fail direct chat calls.
 */
const ANTIGRAVITY_DUPLICATE_MODEL_IDS = new Set(["gemini-3.5-flash", "gemini-3.1-pro-high"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createStatusError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function shouldHideAntigravityModel(modelId: string, info: Record<string, unknown>): boolean {
  if (!modelId) return true;
  if (ANTIGRAVITY_DUPLICATE_MODEL_IDS.has(modelId)) return true;
  if (info.isInternal === true && !modelId.endsWith("-agent")) return true;
  if (ANTIGRAVITY_NON_CHAT_MODEL_IDS.has(modelId)) return true;
  if (modelId.startsWith("chat_")) return true;
  if (modelId.startsWith("tab_")) return true;
  if (modelId.includes("image")) return true;
  return false;
}

export function mapAntigravityAvailableModels(data: unknown): AntigravityLiveModel[] {
  const root = asRecord(data);
  const modelEntries = asRecord(root.models);

  return Object.entries(modelEntries)
    .map(([modelId, value]) => {
      const info = asRecord(value);
      if (!modelId) return null;
      if (shouldHideAntigravityModel(modelId, info)) return null;

      const quotaInfo = asRecord(info.quotaInfo);
      const model: AntigravityLiveModel = {
        id: modelId,
        name:
          typeof info.displayName === "string" && info.displayName.trim().length > 0
            ? info.displayName.trim()
            : modelId,
      };

      if (Object.keys(quotaInfo).length > 0) {
        model.quotaInfo = {
          ...(quotaInfo.remainingFraction != null
            ? { remainingFraction: quotaInfo.remainingFraction as number | string }
            : {}),
          ...(typeof quotaInfo.resetTime === "string" ? { resetTime: quotaInfo.resetTime } : {}),
          ...(typeof quotaInfo.isExhausted === "boolean"
            ? { isExhausted: quotaInfo.isExhausted }
            : {}),
        };
      }

      return model;
    })
    .filter((row): row is AntigravityLiveModel => row !== null);
}

function getAntigravityProjectId(connection: AntigravityConnectionLike): string | null {
  if (typeof connection.projectId === "string" && connection.projectId.trim()) {
    return connection.projectId.trim();
  }
  const providerSpecificData = asRecord(connection.providerSpecificData);
  if (typeof providerSpecificData.projectId === "string" && providerSpecificData.projectId.trim()) {
    return providerSpecificData.projectId.trim();
  }
  return null;
}

async function fetchAntigravityAvailableModels(
  accessToken: string,
  projectId: string,
  proxy: AntigravityProxy
): Promise<Response> {
  return runWithProxyContext(proxy, () =>
    safeOutboundFetch(
      "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": getAntigravityApiUserAgent(),
          "X-Goog-Api-Client": googApiClientHeader(),
          "Client-Metadata": ANTIGRAVITY_CONFIG.loadCodeAssistClientMetadata,
        },
        body: JSON.stringify({ project: projectId }),
      },
      { timeoutMs: 10_000 }
    )
  );
}

async function refreshAntigravityProjectId(
  accessToken: string,
  proxy: AntigravityProxy
): Promise<string | null> {
  const response = await runWithProxyContext(proxy, () =>
    safeOutboundFetch(
      ANTIGRAVITY_CONFIG.loadCodeAssistEndpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": ANTIGRAVITY_CONFIG.loadCodeAssistUserAgent,
          "X-Goog-Api-Client": ANTIGRAVITY_CONFIG.loadCodeAssistApiClient,
          "Client-Metadata": ANTIGRAVITY_CONFIG.loadCodeAssistClientMetadata,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      },
      { timeoutMs: 10_000 }
    )
  );

  if (!response.ok) return null;

  const data = await response.json();
  const project = data?.cloudaicompanionProject;
  if (typeof project === "string" && project.trim().length > 0) return project.trim();
  if (
    project &&
    typeof project === "object" &&
    typeof project.id === "string" &&
    project.id.trim()
  ) {
    return project.id.trim();
  }
  return null;
}

export async function loadAntigravityModelsForConnection(
  connection: AntigravityConnectionLike,
  proxy?: AntigravityProxy
): Promise<AntigravityLiveModel[]> {
  const accessToken = typeof connection.accessToken === "string" ? connection.accessToken : "";
  if (!accessToken) {
    throw createStatusError("No access token for Antigravity. Please reconnect OAuth.", 400);
  }

  const projectId = getAntigravityProjectId(connection);
  if (!projectId) {
    throw createStatusError("Antigravity project ID not available. Please reconnect OAuth.", 400);
  }

  const resolvedProxy = proxy ?? (await resolveProxyForProvider("antigravity"));
  let response = await fetchAntigravityAvailableModels(accessToken, projectId, resolvedProxy);

  if ([400, 403, 404].includes(response.status)) {
    const freshProjectId = await refreshAntigravityProjectId(accessToken, resolvedProxy).catch(
      () => null
    );
    if (freshProjectId && freshProjectId !== projectId) {
      response = await fetchAntigravityAvailableModels(accessToken, freshProjectId, resolvedProxy);
    }
  }

  if (!response.ok) {
    const status = response.status;
    const body = await response.text().catch(() => "");
    const details = body ? `: ${body}` : "";
    throw createStatusError(`Failed to fetch Antigravity models: ${status}${details}`, status);
  }

  return mapAntigravityAvailableModels(await response.json());
}

export function sortAntigravityConnections<T extends AntigravityConnectionLike>(
  connections: T[]
): T[] {
  return [...connections].sort((a, b) => Number(a?.priority || 0) - Number(b?.priority || 0));
}

export async function loadAntigravityModelsFromConnections(
  connections: AntigravityConnectionLike[],
  proxy?: AntigravityProxy
): Promise<AntigravityLiveModel[]> {
  const activeConnections = sortAntigravityConnections(
    connections.filter(
      (connection) => connection?.provider === "antigravity" && connection.isActive !== false
    )
  );

  const resolvedProxy = proxy ?? (await resolveProxyForProvider("antigravity"));
  let lastError: unknown = null;

  for (const connection of activeConnections) {
    try {
      const models = await loadAntigravityModelsForConnection(connection, resolvedProxy);
      if (models.length > 0) return models;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}
