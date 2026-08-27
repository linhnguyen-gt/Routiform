/**
 * Search provider — Brave.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildBraveRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const endpoint = params.searchType === "news" ? "/news/search" : "/web/search";
  const qp = new URLSearchParams({ q: params.query, count: String(params.maxResults) });
  if (params.country) qp.set("country", params.country);
  if (params.language) qp.set("search_lang", params.language);
  return {
    url: `${config.baseUrl}${endpoint}?${qp}`,
    init: {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": params.token },
    },
  };
}

export function normalizeBraveResponse(
  data: unknown,
  _query: string,
  searchType: string
): NormalizedResponse {
  const now = new Date().toISOString();
  const payload = asRecord(data);
  // Brave news endpoint returns { results: [...] } directly,
  // while web endpoint returns { web: { results: [...] } }
  const container =
    searchType === "news" ? asRecord(payload.news || payload) : asRecord(payload.web);
  const items = container.results;
  if (!Array.isArray(items)) return { results: [], totalResults: null };

  const results: SearchResult[] = items.map((item: unknown, idx: number) => {
    const entry = asRecord(item);
    const metaUrl = asRecord(entry.meta_url);
    return makeResult(
      "brave-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
        snippet: typeof entry.description === "string" ? entry.description : undefined,
        published_at:
          typeof entry.page_age === "string"
            ? entry.page_age
            : typeof entry.age === "string"
              ? entry.age
              : undefined,
        favicon_url:
          typeof metaUrl.favicon === "string"
            ? metaUrl.favicon
            : typeof entry.favicon === "string"
              ? entry.favicon
              : undefined,
      },
      idx,
      now
    );
  });

  return {
    results,
    totalResults: typeof container.totalCount === "number" ? container.totalCount : null,
  };
}
