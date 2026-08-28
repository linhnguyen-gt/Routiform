import { z } from "zod";

export const v1SearchSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, "Query is required")
      .max(500, "Query must be 500 characters or fewer"),
    provider: z
      .enum([
        "serper-search",
        "brave-search",
        "perplexity-search",
        "exa-search",
        "tavily-search",
        "searxng-search",
        "duckduckgo-search",
      ])
      .optional(),
    max_results: z.coerce.number().int().min(1).max(100).default(5),
    search_type: z.enum(["web", "news"]).default("web"),
    offset: z.coerce.number().int().min(0).default(0),
    country: z.string().max(2).toUpperCase().optional(),
    language: z.string().min(2).max(5).optional(),
    time_range: z.enum(["any", "day", "week", "month", "year"]).optional(),
    content: z
      .object({
        snippet: z.boolean().default(true),
        full_page: z.boolean().default(false),
        format: z.enum(["text", "markdown"]).default("text"),
        max_characters: z.coerce.number().int().min(100).max(100000).optional(),
      })
      .optional(),
    filters: z
      .object({
        include_domains: z.array(z.string().max(253)).max(20).optional(),
        exclude_domains: z.array(z.string().max(253)).max(20).optional(),
        safe_search: z.enum(["off", "moderate", "strict"]).optional(),
      })
      .optional(),
    synthesis: z
      .object({
        strategy: z.enum(["none", "auto", "provider", "internal"]).default("none"),
        model: z.string().optional(),
        max_tokens: z.coerce.number().int().min(1).max(4000).optional(),
      })
      .optional(),
    provider_options: z.record(z.string(), z.unknown()).optional(),
    strict_filters: z.boolean().default(false),
  })
  .catchall(z.unknown());

export const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  display_url: z.string().optional(),
  snippet: z.string(),
  position: z.number().int().positive(),
  score: z.number().min(0).max(1).nullable().optional(),
  published_at: z.string().nullable().optional(),
  favicon_url: z.string().nullable().optional(),
  content: z
    .object({
      format: z.enum(["text", "markdown"]).optional(),
      text: z.string().optional(),
      length: z.number().int().optional(),
    })
    .nullable()
    .optional(),
  metadata: z
    .object({
      author: z.string().nullable().optional(),
      language: z.string().nullable().optional(),
      source_type: z
        .enum(["article", "blog", "forum", "video", "academic", "news", "other"])
        .nullable()
        .optional(),
      image_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  citation: z.object({
    provider: z.string(),
    retrieved_at: z.string(),
    rank: z.number().int().positive(),
  }),
  provider_raw: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const v1SearchResponseSchema = z.object({
  id: z.string(),
  provider: z.string(),
  query: z.string(),
  results: z.array(searchResultSchema),
  cached: z.boolean(),
  answer: z
    .object({
      source: z.enum(["none", "provider", "internal"]).optional(),
      text: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  usage: z.object({
    queries_used: z.number().int().min(0),
    search_cost_usd: z.number().min(0),
    llm_tokens: z.number().int().min(0).optional(),
  }),
  metrics: z.object({
    response_time_ms: z.number().int().min(0),
    upstream_latency_ms: z.number().int().min(0).optional(),
    gateway_latency_ms: z.number().int().min(0).optional(),
    total_results_available: z.number().int().nullable(),
  }),
  errors: z
    .array(
      z.object({
        provider: z.string(),
        code: z.string(),
        message: z.string(),
      })
    )
    .optional(),
});
