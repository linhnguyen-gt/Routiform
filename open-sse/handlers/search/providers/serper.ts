/**
 * Search provider — Serper.
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildSerperRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const endpoint = params.searchType === "news" ? "/news" : "/search";
  const body: Record<string, unknown> = { q: params.query, num: params.maxResults };
  if (params.country) body.gl = params.country.toLowerCase();
  if (params.language) body.hl = params.language;
  return {
    url: `${config.baseUrl}${endpoint}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": params.token },
      body: JSON.stringify(body),
    },
  };
}

export function normalizeSerperResponse(
  data: unknown,
  _query: string,
  searchType: string
): NormalizedResponse {
  const now = new Date().toISOString();
  const payload = asRecord(data);
  const items = searchType === "news" ? payload.news : payload.organic;
  if (!Array.isArray(items)) return { results: [], totalResults: null };

  const results: SearchResult[] = items.map((item: unknown, idx: number) => {
    const entry = asRecord(item);
    return makeResult(
      "serper-search",
      {
        title: typeof entry.title === "string" ? entry.title : undefined,
        url: typeof entry.link === "string" ? entry.link : undefined,
        snippet:
          typeof entry.snippet === "string"
            ? entry.snippet
            : typeof entry.description === "string"
              ? entry.description
              : undefined,
        published_at: typeof entry.date === "string" ? entry.date : undefined,
      },
      idx,
      now
    );
  });

  const searchParameters = asRecord(payload.searchParameters);
  const totalResultsRaw = searchParameters.totalResults;

  return {
    results,
    totalResults: typeof totalResultsRaw === "number" ? totalResultsRaw : null,
  };
}
