/**
 * Search provider — DuckDuckGo HTML (no API key, unofficial HTML endpoint).
 */
import type { SearchProviderConfig } from "../../../config/searchRegistry.ts";
import type { SearchResult } from "../types.ts";
import { asRecord } from "../types.ts";
import { makeResult } from "../shaping.ts";
import type { SearchRequestParams, NormalizedResponse } from "./common.ts";

export function buildDuckduckgoRequest(
  config: SearchProviderConfig,
  params: SearchRequestParams
): { url: string; init: RequestInit } {
  const qp = new URLSearchParams({ q: params.query });
  return {
    url: `${config.baseUrl}?${qp}`,
    init: {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; Routiform/1.0)",
      },
    },
  };
}

function decodeDuckduckgoHref(href: string): string {
  try {
    const url = new URL(href, "https://html.duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    /* keep href */
  }
  return href;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDuckduckgoHtml(
  html: string
): Array<{ title: string; url: string; snippet: string }> {
  const parsed: Array<{ title: string; url: string; snippet: string }> = [];
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const url = decodeDuckduckgoHref((match[1] || "").replace(/&amp;/g, "&"));
    const title = stripTags(match[2] || "");
    if (!url.startsWith("http") || !title) continue;
    const windowHtml = html.slice(match.index, match.index + 2500);
    const snip = windowHtml.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    parsed.push({ title, url, snippet: snip ? stripTags(snip[1] || "") : "" });
  }
  return parsed;
}

export function normalizeDuckduckgoResponse(
  data: unknown,
  _query: string,
  _searchType: string
): NormalizedResponse {
  const now = new Date().toISOString();
  const payload = asRecord(data);
  const html = typeof payload.html === "string" ? payload.html : "";
  const parsed = parseDuckduckgoHtml(html);
  const results: SearchResult[] = parsed.map((item, idx) =>
    makeResult("duckduckgo-search", item, idx, now)
  );
  return { results, totalResults: results.length };
}
