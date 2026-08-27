/**
 * Search provider — shared contracts and dispatch tables.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { buildSerperRequest, normalizeSerperResponse } from "./serper.ts";
import { buildBraveRequest, normalizeBraveResponse } from "./brave.ts";
import { buildPerplexityRequest, normalizePerplexityResponse } from "./perplexity.ts";
import { buildExaRequest, normalizeExaResponse } from "./exa.ts";
import { buildTavilyRequest, normalizeTavilyResponse } from "./tavily.ts";

export interface SearchRequestParams {
  query: string;
  searchType: string;
  maxResults: number;
  token: string;
  country?: string;
  language?: string;
  domainFilter?: string[];
}
export interface NormalizedResponse {
  results: SearchResult[];
  totalResults: number | null;
}

type RequestBuilder = (
  config: SearchProviderConfig,
  params: SearchRequestParams
) => { url: string; init: RequestInit };

type ResponseNormalizer = (data: unknown, query: string, searchType: string) => NormalizedResponse;

const REQUEST_BUILDERS: Record<string, RequestBuilder> = {
  "serper-search": buildSerperRequest,
  "brave-search": buildBraveRequest,
  "perplexity-search": buildPerplexityRequest,
  "exa-search": buildExaRequest,
  "tavily-search": buildTavilyRequest,
};

const RESPONSE_NORMALIZERS: Record<string, ResponseNormalizer> = {
  "serper-search": normalizeSerperResponse,
  "brave-search": normalizeBraveResponse,
  "perplexity-search": normalizePerplexityResponse,
  "exa-search": normalizeExaResponse,
  "tavily-search": normalizeTavilyResponse,
};

export function buildRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const builder = REQUEST_BUILDERS[config.id];
  if (builder) return builder(config, params);
  // Fallback for future providers: POST with bearer auth
  return {
    url: config.baseUrl,
    init: {
      method: config.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
      body: JSON.stringify({
        query: params.query,
        max_results: params.maxResults,
        search_type: params.searchType,
      }),
    },
  };
}

export function normalizeResponse(
  providerId: string,
  data: unknown,
  query: string,
  searchType: string
): NormalizedResponse {
  const normalizer = RESPONSE_NORMALIZERS[providerId];
  if (normalizer) return normalizer(data, query, searchType);
  return { results: [], totalResults: null };
}
