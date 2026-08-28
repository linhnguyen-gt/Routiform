/**
 * Search Provider Registry
 *
 * Defines providers that support the /v1/search endpoint.
 * Unlike LLM/embedding providers, search providers don't have "models" —
 * a provider IS the model (Serper = Google SERP, Brave = Brave index).
 *
 * API keys are stored in the same provider credentials system,
 * keyed by provider ID (e.g. "serper-search", "brave-search").
 * perplexity-search reuses credentials from the "perplexity" chat provider.
 */

export interface SearchProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  method: "GET" | "POST";
  authType: "apikey" | "none";
  authHeader: string;
  costPerQuery: number;
  freeMonthlyQuota: number;
  searchTypes: string[];
  defaultMaxResults: number;
  maxMaxResults: number;
  timeoutMs: number;
  cacheTTLMs: number;
  responseFormat?: "json" | "html";
}

export const SEARCH_PROVIDERS: Record<string, SearchProviderConfig> = {
  "serper-search": {
    id: "serper-search",
    name: "Serper Search",
    baseUrl: "https://google.serper.dev",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 0.001,
    freeMonthlyQuota: 2500,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "brave-search": {
    id: "brave-search",
    name: "Brave Search",
    baseUrl: "https://api.search.brave.com/res/v1",
    method: "GET",
    authType: "apikey",
    authHeader: "x-subscription-token",
    costPerQuery: 0.005,
    freeMonthlyQuota: 1000,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 10_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "perplexity-search": {
    id: "perplexity-search",
    name: "Perplexity Search",
    baseUrl: "https://api.perplexity.ai/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.005,
    freeMonthlyQuota: 0,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 10_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "exa-search": {
    id: "exa-search",
    name: "Exa Search",
    baseUrl: "https://api.exa.ai/search",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 0.007,
    freeMonthlyQuota: 1000,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "tavily-search": {
    id: "tavily-search",
    name: "Tavily Search",
    baseUrl: "https://api.tavily.com/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.008,
    freeMonthlyQuota: 1000,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 10_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "searxng-search": {
    id: "searxng-search",
    name: "SearXNG",
    baseUrl: "",
    method: "GET",
    authType: "none",
    authHeader: "",
    costPerQuery: 0,
    freeMonthlyQuota: 0,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 12_000,
    cacheTTLMs: 5 * 60 * 1000,
  },

  "duckduckgo-search": {
    id: "duckduckgo-search",
    name: "DuckDuckGo",
    baseUrl: "https://html.duckduckgo.com/html/",
    method: "GET",
    authType: "none",
    authHeader: "",
    costPerQuery: 0,
    freeMonthlyQuota: 0,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 10,
    timeoutMs: 12_000,
    cacheTTLMs: 5 * 60 * 1000,
    responseFormat: "html",
  },
};

/**
 * Credential fallback mapping — search providers that can reuse credentials
 * from a related provider (e.g., perplexity-search uses the same API key as perplexity chat).
 */
export const SEARCH_CREDENTIAL_FALLBACKS: Record<string, string> = {
  "perplexity-search": "perplexity",
};

/**
 * Get search provider config by ID
 */
export function getSearchProvider(providerId: string): SearchProviderConfig | null {
  return SEARCH_PROVIDERS[providerId] || null;
}

/**
 * Get all search providers as a flat list
 */
export function getAllSearchProviders(): Array<{
  id: string;
  name: string;
  searchTypes: string[];
}> {
  return Object.values(SEARCH_PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    searchTypes: p.searchTypes,
  }));
}

/**
 * Select the cheapest available provider.
 * If an explicit provider is given, validate and return it.
 * Otherwise, return the cheapest by costPerQuery.
 */
export function keyedSearchProviders(): SearchProviderConfig[] {
  return Object.values(SEARCH_PROVIDERS).filter((p) => p.authType === "apikey");
}

export function getSearxngBaseUrl(): string {
  const raw = (process.env.SEARXNG_URL || process.env.SEARXNG_API_BASE || "").trim();
  return raw.replace(/\/+$/, "");
}

export function isKeylessSearchReady(config: SearchProviderConfig): boolean {
  if (config.authType !== "none") return false;
  if (config.id === "searxng-search") return getSearxngBaseUrl().length > 0;
  return true;
}

export function withResolvedSearchBaseUrl(config: SearchProviderConfig): SearchProviderConfig {
  if (config.id !== "searxng-search") return config;
  const baseUrl = getSearxngBaseUrl();
  return baseUrl ? { ...config, baseUrl } : config;
}

export function selectProvider(explicitProvider?: string): SearchProviderConfig | null {
  if (explicitProvider) {
    return SEARCH_PROVIDERS[explicitProvider] || null;
  }

  const providers = keyedSearchProviders();
  if (providers.length === 0) return null;

  return providers.reduce((cheapest, p) => (p.costPerQuery < cheapest.costPerQuery ? p : cheapest));
}
