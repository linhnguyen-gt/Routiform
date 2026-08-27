/**
 * Search provider — Tavily.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult, parseDomainFilter } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildTavilyRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const { includes, excludes } = parseDomainFilter(params.domainFilter);
  const body: Record<string, unknown> = {
    query: params.query,
    max_results: params.maxResults,
    topic: params.searchType === "news" ? "news" : "general",
  };
  if (includes.length) body.include_domains = includes;
  if (excludes.length) body.exclude_domains = excludes;
  if (params.country) body.country = params.country;
  return {
    url: config.baseUrl,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
      body: JSON.stringify(body),
    },
  };
}

export function normalizeTavilyResponse(
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
      "tavily-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
        snippet: typeof entry.content === "string" ? entry.content : "",
        score: typeof entry.score === "number" ? entry.score : undefined,
        published_at: typeof entry.published_date === "string" ? entry.published_date : undefined,
        full_text: typeof entry.raw_content === "string" ? entry.raw_content : undefined,
        text_format: "text",
      },
      idx,
      now
    );
  });
  return { results, totalResults: results.length };
}
