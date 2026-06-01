/**
 * Qoder model catalog fetcher.
 *
 * Calls /algo/api/v2/model/list (COSY-signed) on the inference host to get
 * the live catalog for an authenticated Qoder account, then caches the
 * per-model `model_config` blocks by key. Chat requests later look up the
 * exact server-published metadata for the model they want — Qoder's chat
 * endpoint silently downgrades to a different model when the wrong
 * model_config is sent.
 *
 * On any error the live cache stays empty and chatExecuteCall surfaces the
 * problem to the user as "model config not yet fetched, retry shortly".
 */

import { createHash } from "crypto";

import { buildCosyHeaders } from "@/lib/qoder/cosy";
import { QODER_MODEL_LIST_URL } from "@/lib/qoder/constants";
import type { ProviderCredentials } from "../executors/base.ts";

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h, same as the Kiro catalog

export type QoderModelEntry = {
  id: string;
  name: string;
  contextLength: number;
  isVL: boolean;
  isReasoning: boolean;
  maxOutputTokens: number;
  description: string;
};

export type QoderModelConfig = Record<string, unknown> & { key?: string };

export type QoderCatalogEntry = {
  expiresAt: number;
  models: QoderModelEntry[];
  rawConfigs: Map<string, QoderModelConfig>;
  fetched: boolean;
};

export type ResolveOptions = {
  forceRefresh?: boolean;
  log?: unknown;
  signal?: AbortSignal | null;
};

const catalogCache = new Map<string, QoderCatalogEntry>();
const inflight = new Map<string, Promise<QoderCatalogEntry | null>>();

/**
 * Stable cache key per credential (so different login sessions for the same
 * account share an entry).
 */
function cacheKey(credentials: ProviderCredentials): string {
  const psd = credentials?.providerSpecificData || {};
  const seed =
    (typeof psd.userId === "string" && psd.userId) ||
    credentials?.refreshToken ||
    credentials?.accessToken ||
    "anonymous";
  return createHash("sha256").update(`qoder:${seed}`).digest("hex");
}

/**
 * Strip credential -> COSY creds for buildCosyHeaders.
 */
function cosyCredsFromConnection(credentials: ProviderCredentials) {
  const psd = (credentials?.providerSpecificData || {}) as Record<string, unknown>;
  return {
    userId: typeof psd.userId === "string" ? psd.userId : "",
    authToken: credentials.accessToken || "",
    name:
      (typeof psd.name === "string" && psd.name) ||
      (typeof psd.displayName === "string" && psd.displayName) ||
      "",
    email: (typeof psd.email === "string" && psd.email) || "",
    machineId: typeof psd.machineId === "string" ? psd.machineId : "",
  };
}

/**
 * Fetch the live model list for this credential. Returns
 *   { models, rawConfigs }
 * or `null` on any error.
 */
async function fetchQoderCatalogRaw(
  credentials: ProviderCredentials,
  signal?: AbortSignal | null
): Promise<{ models: QoderModelEntry[]; rawConfigs: Map<string, QoderModelConfig> } | null> {
  const creds = cosyCredsFromConnection(credentials);
  if (!creds.userId || !creds.authToken) return null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "identity",
    ...buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, creds),
  };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  let response: Response;
  try {
    timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
    if (signal && typeof signal.addEventListener === "function") {
      // If the parent signal already aborted before we got here, the
      // 'abort' event has already fired and addEventListener won't
      // re-trigger it. Propagate the cancellation immediately.
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        abortListener = () => controller.abort(signal.reason);
        signal.addEventListener("abort", abortListener);
      }
    }
    // globalThis.fetch is patched by open-sse/utils/proxyFetch.ts to honor
    // the ambient runWithProxyContext when present.
    response = await fetch(QODER_MODEL_LIST_URL, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }

  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.chat)) return null;

  const models: QoderModelEntry[] = [];
  const rawConfigs = new Map<string, QoderModelConfig>();
  for (const entry of body.chat as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== "object") continue;
    const key = typeof entry.key === "string" ? entry.key : "";
    if (!key) continue;

    // Always cache the config — chat needs model_config even for UI-hidden
    // models (enable:false). Upstream still accepts chat for these keys.
    rawConfigs.set(key, entry as QoderModelConfig);
    if (entry.enable === false) continue;

    const display = (typeof entry.display_name === "string" && entry.display_name) || key;
    const ctx = Number(entry.max_input_tokens) || 131_072;
    models.push({
      id: key,
      name: `${display}`,
      contextLength: ctx,
      isVL: !!entry.is_vl,
      isReasoning: !!entry.is_reasoning,
      maxOutputTokens: Number(entry.max_output_tokens) || 0,
      description: (typeof entry.description === "string" && entry.description) || "",
    });
  }

  return { models, rawConfigs };
}

/**
 * Get the cached model_config block for a given model key, fetching the
 * catalog first if needed. Returns null when the catalog can't be fetched
 * (so callers can fall back to the static registry).
 */
export async function getQoderModelConfig(
  credentials: ProviderCredentials,
  modelKey: string,
  options: ResolveOptions = {}
): Promise<QoderModelConfig | null> {
  const cached = await resolveQoderModels(credentials, options);
  if (!cached) return null;
  const config = cached.rawConfigs.get(modelKey);
  if (!config) return null;
  // Defensive copy — chat code may mutate `key` to align with the alias path.
  return { ...config, key: modelKey };
}

/**
 * Resolve the live model catalog + raw configs for a credential. Caches
 * results for CACHE_TTL_MS so repeated chat requests don't re-fetch, and
 * deduplicates concurrent misses so parallel chat windows fan-out exactly
 * one upstream request per credential.
 */
export async function resolveQoderModels(
  credentials: ProviderCredentials,
  options: ResolveOptions = {}
): Promise<QoderCatalogEntry | null> {
  if (!credentials?.accessToken) return null;
  const psd = (credentials.providerSpecificData || {}) as Record<string, unknown>;
  if (!psd.userId) return null;

  const key = cacheKey(credentials);
  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached;
    }
  }

  // Coalesce concurrent misses on the same credential into one upstream call.
  // forceRefresh callers still get their own fetch (they wanted fresh data).
  const existing = inflight.get(key);
  if (existing && !options.forceRefresh) {
    return existing;
  }

  const fetchPromise = (async () => {
    const fetched = await fetchQoderCatalogRaw(credentials, options.signal);
    if (!fetched) return null;
    const entry: QoderCatalogEntry = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      models: fetched.models,
      rawConfigs: fetched.rawConfigs,
      fetched: true,
    };
    catalogCache.set(key, entry);
    return entry;
  })();

  inflight.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    // Clear only if this is still the in-flight entry — a forceRefresh
    // call that started later may have replaced it.
    if (inflight.get(key) === fetchPromise) {
      inflight.delete(key);
    }
  }
}

export function invalidateQoderCatalog(credentials: ProviderCredentials | null | undefined): void {
  if (!credentials) return;
  catalogCache.delete(cacheKey(credentials));
}

export function clearQoderCatalog(): void {
  catalogCache.clear();
}
