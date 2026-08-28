/**
 * Pick a search backend: keyed providers first, then SearXNG, then DuckDuckGo.
 */
import { getProviderCredentials } from "@/sse/services/auth";
import {
  SEARCH_CREDENTIAL_FALLBACKS,
  SEARCH_PROVIDERS,
  getSearchProvider,
  isKeylessSearchReady,
  keyedSearchProviders,
  type SearchProviderConfig,
} from "../config/searchRegistry.ts";

export type SearchBackendPick = {
  config: SearchProviderConfig;
  credentials: Record<string, unknown>;
  alternateProvider?: string;
  alternateCredentials?: Record<string, unknown> | null;
};

function isUsableSearchCreds(creds: Record<string, unknown> | null): boolean {
  if (!creds || creds.allRateLimited === true) return false;
  const apiKey = creds.apiKey;
  const accessToken = creds.accessToken;
  return (
    (typeof apiKey === "string" && apiKey.length > 0) ||
    (typeof accessToken === "string" && accessToken.length > 0)
  );
}

async function resolveSearchCredentials(providerId: string) {
  const creds = await getProviderCredentials(providerId).catch(() => null);
  if (isUsableSearchCreds(creds)) return creds;
  const fallbackId = SEARCH_CREDENTIAL_FALLBACKS[providerId];
  if (!fallbackId) return null;
  const fallback = await getProviderCredentials(fallbackId).catch(() => null);
  return isUsableSearchCreds(fallback) ? fallback : null;
}

function keylessFallbacks(): SearchProviderConfig[] {
  return ["searxng-search", "duckduckgo-search"]
    .map((id) => getSearchProvider(id))
    .filter((p): p is SearchProviderConfig => !!p && isKeylessSearchReady(p));
}

async function keyedPick(
  excludeId?: string
): Promise<{ config: SearchProviderConfig; credentials: Record<string, unknown> } | null> {
  const sorted = keyedSearchProviders().sort((a, b) => a.costPerQuery - b.costPerQuery);
  for (const config of sorted) {
    if (excludeId && config.id === excludeId) continue;
    const credentials = await resolveSearchCredentials(config.id);
    if (credentials) return { config, credentials };
  }
  return null;
}

export async function pickSearchBackend(
  explicitProvider?: string
): Promise<SearchBackendPick | null> {
  if (explicitProvider) {
    const config = getSearchProvider(explicitProvider);
    if (!config) return null;
    if (config.authType === "none") {
      if (!isKeylessSearchReady(config)) return null;
      return { config, credentials: {} };
    }
    const credentials = await resolveSearchCredentials(config.id);
    if (!credentials) return null;
    return { config, credentials };
  }

  const keyed = await keyedPick();
  if (keyed) {
    const alternateKeyed = await keyedPick(keyed.config.id);
    if (alternateKeyed) {
      return {
        ...keyed,
        alternateProvider: alternateKeyed.config.id,
        alternateCredentials: alternateKeyed.credentials,
      };
    }
    const keyless = keylessFallbacks()[0];
    if (keyless) {
      return {
        ...keyed,
        alternateProvider: keyless.id,
        alternateCredentials: {},
      };
    }
    return keyed;
  }

  const [primary, ...rest] = keylessFallbacks();
  if (!primary) return null;
  const alternate = rest[0];
  return {
    config: primary,
    credentials: {},
    alternateProvider: alternate?.id,
    alternateCredentials: alternate ? {} : null,
  };
}

export async function listSearchChain(): Promise<SearchBackendPick[]> {
  const chain: SearchBackendPick[] = [];
  const seen = new Set<string>();
  const sorted = keyedSearchProviders().sort((a, b) => a.costPerQuery - b.costPerQuery);
  for (const config of sorted) {
    const credentials = await resolveSearchCredentials(config.id);
    if (!credentials || seen.has(config.id)) continue;
    seen.add(config.id);
    chain.push({ config, credentials });
  }
  for (const config of keylessFallbacks()) {
    if (seen.has(config.id)) continue;
    seen.add(config.id);
    chain.push({ config, credentials: {} });
  }
  return chain;
}

export function listSearchProviderIds(): string[] {
  return Object.keys(SEARCH_PROVIDERS);
}
