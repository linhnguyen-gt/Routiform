/**
 * Search handler — result shaping helpers shared by provider normalizers.
 */
import type { SearchResult } from "./types.ts";

export function makeResult(
  providerId: string,
  item: {
    title?: string;
    url?: string;
    snippet?: string;
    score?: number;
    published_at?: string;
    favicon_url?: string;
    author?: string;
    source_type?: string;
    image_url?: string;
    full_text?: string;
    text_format?: string;
  },
  idx: number,
  now: string
): SearchResult {
  const url = item.url || "";
  return {
    title: item.title || "",
    url,
    display_url: url ? url.replace(/^https?:\/\/(www\.)?/, "").split("?")[0] : undefined,
    snippet: item.snippet || "",
    position: idx + 1,
    score: typeof item.score === "number" ? Math.min(1, Math.max(0, item.score)) : null,
    published_at: item.published_at || null,
    favicon_url: item.favicon_url || null,
    content: item.full_text
      ? { format: item.text_format || "text", text: item.full_text, length: item.full_text.length }
      : null,
    metadata: {
      author: item.author || null,
      language: null,
      source_type: item.source_type || null,
      image_url: item.image_url || null,
    },
    citation: { provider: providerId, retrieved_at: now, rank: idx + 1 },
    provider_raw: null,
  };
}

export function parseDomainFilter(domainFilter?: string[]): {
  includes: string[];
  excludes: string[];
} {
  if (!domainFilter?.length) return { includes: [], excludes: [] };
  const includes = domainFilter.filter((d) => !d.startsWith("-"));
  const excludes = domainFilter.filter((d) => d.startsWith("-")).map((d) => d.slice(1));
  return { includes, excludes };
}
