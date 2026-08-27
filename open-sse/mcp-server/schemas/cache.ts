import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// ============ Cache Tools ============

export const cacheStatsInput = z.object({}).describe("No parameters required");

export const cacheStatsOutput = z.object({
  semanticCache: z.object({
    memoryEntries: z.number(),
    dbEntries: z.number(),
    hits: z.number(),
    misses: z.number(),
    hitRate: z.string(),
    tokensSaved: z.number(),
  }),
  promptCache: z
    .object({
      totalRequests: z.number(),
      requestsWithCacheControl: z.number(),
      totalCachedTokens: z.number(),
      totalCacheCreationTokens: z.number(),
      estimatedCostSaved: z.number(),
    })
    .nullable(),
  idempotency: z.object({
    activeKeys: z.number(),
    windowMs: z.number(),
  }),
});

export const cacheStatsTool: McpToolDefinition<typeof cacheStatsInput, typeof cacheStatsOutput> = {
  name: "routiform_cache_stats",
  description:
    "Returns cache statistics including semantic cache hit rate, prompt cache metrics by provider, and idempotency layer stats.",
  inputSchema: cacheStatsInput,
  outputSchema: cacheStatsOutput,
  scopes: ["read:cache"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/cache"],
};

export const cacheFlushInput = z.object({
  signature: z.string().optional().describe("Specific cache signature to invalidate"),
  model: z.string().optional().describe("Invalidate all entries for a specific model"),
});

export const cacheFlushOutput = z.object({
  ok: z.boolean(),
  invalidated: z.number().optional(),
  scope: z.string().optional(),
});

export const cacheFlushTool: McpToolDefinition<typeof cacheFlushInput, typeof cacheFlushOutput> = {
  name: "routiform_cache_flush",
  description:
    "Flush cache entries. Provide signature to invalidate a single entry, model to invalidate all entries for a model, or omit both to clear all.",
  inputSchema: cacheFlushInput,
  outputSchema: cacheFlushOutput,
  scopes: ["write:cache"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/cache"],
};

// --- Tool: routiform_get_compression_info ---
export const getCompressionInfoInput = z.object({}).describe("No parameters required");

export const getCompressionInfoOutput = z.object({
  stack: z.array(z.string()),
  gate: z.string(),
  modes: z.array(z.string()),
  header: z.string(),
});

export const getCompressionInfoTool: McpToolDefinition<
  typeof getCompressionInfoInput,
  typeof getCompressionInfoOutput
> = {
  name: "routiform_get_compression_info",
  description:
    "Describes the request compression stack (RTK → Caveman EN → inflation guard) and how it is gated.",
  inputSchema: getCompressionInfoInput,
  outputSchema: getCompressionInfoOutput,
  scopes: ["read:settings"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: [],
};
