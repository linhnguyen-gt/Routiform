/**
 * Search provider — SearXNG (self-hosted, no API key).
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildSearxngRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const qp = new URLSearchParams({
    q: params.query,
    format: "json",
    categories: params.searchType === "news" ? "news" : "general",
  });
  if (params.language) qp.set("language", params.language);
  const base = config.baseUrl.replace(/\/+$/, "");
  return {
    url: `${base}/search?${qp}`,
    init: {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  };
}

export function normalizeSearxngResponse(
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
      "searxng-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
        snippet: typeof entry.content === "string" ? entry.content : undefined,
        published_at: typeof entry.publishedDate === "string" ? entry.publishedDate : undefined,
      },
      idx,
      now
    );
  });

  return { results, totalResults: results.length };
}
