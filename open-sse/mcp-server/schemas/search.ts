import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 9: routiform_web_search ---
export const webSearchInput = z.object({
  query: z
    .string()
    .min(1, "Query is required")
    .max(500, "Query must be 500 characters or fewer")
    .describe("The search query string"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of search results to return"),
  search_type: z.enum(["web", "news"]).default("web").describe("Type of search to perform"),
  provider: z
    .enum(["serper-search", "brave-search", "perplexity-search", "exa-search", "tavily-search"])
    .optional()
    .describe("Specific search provider to use"),
});

export const webSearchOutput = z.object({
  id: z.string(),
  provider: z.string(),
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      display_url: z.string().optional(),
      snippet: z.string(),
      position: z.number().int().positive(),
    })
  ),
  cached: z.boolean(),
  usage: z.object({
    queries_used: z.number().int().min(0),
    search_cost_usd: z.number().min(0),
  }),
});

export const webSearchTool: McpToolDefinition<typeof webSearchInput, typeof webSearchOutput> = {
  name: "routiform_web_search",
  description:
    "Performs a web search using Routiform's search gateway. Supports multiple providers (Serper, Brave, Perplexity, Exa, Tavily) with automatic failover. Returns search results with titles, URLs, snippets, and position data.",
  inputSchema: webSearchInput,
  outputSchema: webSearchOutput,
  scopes: ["execute:search"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/v1/search"],
};

// --- Tool 9: routiform_simulate_route ---
export const simulateRouteInput = z.object({
  model: z.string().describe("Target model for simulation"),
  promptTokenEstimate: z.number().describe("Estimated prompt token count"),
  combo: z.string().optional().describe("Specific combo to simulate (default: active combo)"),
});

export const simulateRouteOutput = z.object({
  simulatedPath: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      probability: z.number(),
      estimatedCost: z.number(),
      healthStatus: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]),
      quotaAvailable: z.number(),
    })
  ),
  fallbackTree: z.object({
    primary: z.string(),
    fallbacks: z.array(z.string()),
    worstCaseCost: z.number(),
    bestCaseCost: z.number(),
  }),
});

export const simulateRouteTool: McpToolDefinition<
  typeof simulateRouteInput,
  typeof simulateRouteOutput
> = {
  name: "routiform_simulate_route",
  description:
    "Simulates (dry-run) the routing path a request would take without actually executing it. Shows the fallback tree, provider probabilities, estimated costs, and health status.",
  inputSchema: simulateRouteInput,
  outputSchema: simulateRouteOutput,
  scopes: ["read:health", "read:combos"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/monitoring/health", "/api/resilience"],
};
