/**
 * Search handler — shared types, constants and input sanitization.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  display_url?: string;
  snippet: string;
  position: number;
  score: number | null;
  published_at: string | null;
  favicon_url: string | null;
  content: { format: string; text: string; length: number } | null;
  metadata: {
    author: string | null;
    language: string | null;
    source_type: string | null;
    image_url: string | null;
  } | null;
  citation: {
    provider: string;
    retrieved_at: string;
    rank: number;
  };
  provider_raw: Record<string, unknown> | null;
}

export interface SearchResponse {
  provider: string;
  query: string;
  results: SearchResult[];
  answer: { source: string; text: string | null; model: string | null } | null;
  usage: { queries_used: number; search_cost_usd: number; llm_tokens?: number };
  metrics: {
    response_time_ms: number;
    upstream_latency_ms: number;
    gateway_latency_ms?: number;
    total_results_available: number | null;
  };
  errors: Array<{ provider: string; code: string; message: string }>;
}

interface SearchHandlerResult {
  success: boolean;
  status?: number;
  error?: string;
  data?: SearchResponse;
}

interface SearchHandlerOptions {
  query: string;
  provider: string;
  maxResults: number;
  searchType: string;
  country?: string;
  language?: string;
  timeRange?: string;
  offset?: number;
  domainFilter?: string[];
  contentOptions?: {
    snippet?: boolean;
    full_page?: boolean;
    format?: string;
    max_characters?: number;
  };
  strictFilters?: boolean;
  providerOptions?: Record<string, unknown>;
  credentials: Record<string, unknown>;
  alternateProvider?: string;
  alternateCredentials?: Record<string, unknown> | null;
  log?: {
    info?: (tag: string, message: string) => void;
    warn?: (tag: string, message: string) => void;
    error?: (tag: string, message: string) => void;
  };
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

// ── Constants ────────────────────────────────────────────────────────────

const GLOBAL_TIMEOUT_MS = 15_000;

// Non-retriable HTTP status codes — fail immediately, don't try alternate
const NON_RETRIABLE = new Set([400, 401, 403, 404]);

// ── Input Sanitization ──────────────────────────────────────────────────

// Control characters that should never appear in search queries
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function sanitizeQuery(query: string): { clean: string; error?: string } {
  if (CONTROL_CHAR_RE.test(query)) {
    return { clean: "", error: "Query contains invalid control characters" };
  }
  const clean = query.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (clean.length === 0) {
    return { clean: "", error: "Query is empty after normalization" };
  }
  return { clean };
}

export type { SearchHandlerOptions, SearchHandlerResult, JsonRecord };
export { asRecord, GLOBAL_TIMEOUT_MS, NON_RETRIABLE, sanitizeQuery };
