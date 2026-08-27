/**
 * Search provider — Perplexity.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildPerplexityRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = { query: params.query, max_results: params.maxResults };
  if (params.country) body.country = params.country;
  if (params.language) body.search_language_filter = [params.language];
  if (params.domainFilter?.length) body.search_domain_filter = params.domainFilter;
  return {
    url: config.baseUrl,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
      body: JSON.stringify(body),
    },
  };
}

export function normalizePerplexityResponse(
  data: unknown,
  _query: string,
  _searchType: string
): NormalizedResponse {
  const now = new Date().toISOString();
  const payload = asRecord(data);
  const items = payload.results;
  if (!Array.isArray(items)) return { results: [], totalResults: null };

  const results: SearchResult[] = items.map((item: unknown, idx: number) => {
    const entry = asRecord(item);
    return makeResult(
      "perplexity-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
        snippet: typeof entry.snippet === "string" ? entry.snippet : undefined,
        published_at:
          typeof entry.date === "string"
            ? entry.date
            : typeof entry.last_updated === "string"
              ? entry.last_updated
              : undefined,
      },
      idx,
      now
    );
  });
  return { results, totalResults: results.length };
}
