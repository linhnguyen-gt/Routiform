/**
 * Search provider — Exa.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult, parseDomainFilter } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildExaRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const { includes, excludes } = parseDomainFilter(params.domainFilter);
  const body: Record<string, unknown> = {
    query: params.query,
    numResults: params.maxResults,
    type: "auto",
    text: true,
    highlights: true,
  };
  if (includes.length) body.includeDomains = includes;
  if (excludes.length) body.excludeDomains = excludes;
  if (params.searchType === "news") body.category = "news";
  return {
    url: config.baseUrl,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": params.token },
      body: JSON.stringify(body),
    },
  };
}

export function normalizeExaResponse(
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
    const highlights = Array.isArray(entry.highlights) ? entry.highlights : [];
    const firstHighlight = typeof highlights[0] === "string" ? highlights[0] : undefined;
    const text = typeof entry.text === "string" ? entry.text : undefined;
    return makeResult(
      "exa-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
        snippet: firstHighlight || text?.slice(0, 300) || "",
        score: typeof entry.score === "number" ? entry.score : undefined,
        published_at: typeof entry.publishedDate === "string" ? entry.publishedDate : undefined,
        favicon_url: typeof entry.favicon === "string" ? entry.favicon : undefined,
        author: typeof entry.author === "string" ? entry.author : undefined,
        image_url: typeof entry.image === "string" ? entry.image : undefined,
        full_text: text,
        text_format: "text",
      },
      idx,
      now
    );
  });
  return { results, totalResults: results.length };
}
