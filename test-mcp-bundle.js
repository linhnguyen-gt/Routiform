// open-sse/mcp-server/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// open-sse/mcp-server/schemas/tools.ts
import { z } from "zod";
var getHealthInput = z.object({}).describe("No parameters required");
var getHealthOutput = z.object({
  uptime: z.string(),
  version: z.string(),
  memoryUsage: z.object({
    heapUsed: z.number(),
    heapTotal: z.number(),
  }),
  circuitBreakers: z.array(
    z.object({
      provider: z.string(),
      state: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]),
      failureCount: z.number(),
      lastFailure: z.string().nullable(),
    })
  ),
  rateLimits: z.array(
    z.object({
      provider: z.string(),
      rpm: z.number(),
      currentUsage: z.number(),
      isLimited: z.boolean(),
    })
  ),
  cacheStats: z
    .object({
      hits: z.number(),
      misses: z.number(),
      hitRate: z.number(),
    })
    .optional(),
});
var getHealthTool = {
  name: "omniroute_get_health",
  description:
    "Returns the current health status of OmniRoute including uptime, memory usage, circuit breaker states for all providers, rate limit status, and cache statistics.",
  inputSchema: getHealthInput,
  outputSchema: getHealthOutput,
  scopes: ["read:health"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/monitoring/health", "/api/resilience", "/api/rate-limits"],
};
var listCombosInput = z.object({
  includeMetrics: z
    .boolean()
    .optional()
    .describe("Include request count, success rate, latency, and cost metrics per combo"),
});
var listCombosOutput = z.object({
  combos: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      models: z.array(
        z.object({
          provider: z.string(),
          model: z.string(),
          priority: z.number(),
        })
      ),
      strategy: z.enum([
        "priority",
        "weighted",
        "round-robin",
        "strict-random",
        "random",
        "least-used",
        "cost-optimized",
        "auto",
      ]),
      enabled: z.boolean(),
      metrics: z
        .object({
          requestCount: z.number(),
          successRate: z.number(),
          avgLatencyMs: z.number(),
          totalCost: z.number(),
        })
        .optional(),
    })
  ),
});
var listCombosTool = {
  name: "omniroute_list_combos",
  description:
    "Lists all configured combos (model chains) with their strategies and optionally includes performance metrics. Combos define how requests are routed across multiple providers.",
  inputSchema: listCombosInput,
  outputSchema: listCombosOutput,
  scopes: ["read:combos"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/combos", "/api/combos/metrics"],
};
var getComboMetricsInput = z.object({
  comboId: z.string().describe("ID of the combo to get metrics for"),
});
var getComboMetricsOutput = z.object({
  requests: z.number(),
  successRate: z.number(),
  avgLatency: z.number(),
  costTotal: z.number(),
  fallbackCount: z.number(),
  byProvider: z.array(
    z.object({
      provider: z.string(),
      requests: z.number(),
      successRate: z.number(),
      avgLatency: z.number(),
    })
  ),
});
var getComboMetricsTool = {
  name: "omniroute_get_combo_metrics",
  description:
    "Returns detailed performance metrics for a specific combo including request count, success rate, average latency, total cost, and per-provider breakdowns.",
  inputSchema: getComboMetricsInput,
  outputSchema: getComboMetricsOutput,
  scopes: ["read:combos"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/combos/metrics"],
};
var switchComboInput = z.object({
  comboId: z.string().describe("ID of the combo to activate/deactivate"),
  active: z.boolean().describe("Whether to enable or disable the combo"),
});
var switchComboOutput = z.object({
  success: z.boolean(),
  combo: z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
  }),
});
var switchComboTool = {
  name: "omniroute_switch_combo",
  description:
    "Activates or deactivates a combo. When deactivated, requests will not be routed through this combo. Use to toggle between different routing strategies.",
  inputSchema: switchComboInput,
  outputSchema: switchComboOutput,
  scopes: ["write:combos"],
  auditLevel: "full",
  phase: 1,
  sourceEndpoints: ["/api/combos"],
};
var checkQuotaInput = z.object({
  provider: z
    .string()
    .optional()
    .describe(
      "Filter by provider name (e.g., 'claude', 'gemini'). If omitted, returns all providers."
    ),
  connectionId: z.string().optional().describe("Filter by specific connection ID"),
});
var checkQuotaOutput = z.object({
  providers: z.array(
    z.object({
      name: z.string(),
      provider: z.string(),
      connectionId: z.string(),
      quotaUsed: z.number(),
      quotaTotal: z.number().nullable(),
      percentRemaining: z.number(),
      resetAt: z.string().nullable(),
      tokenStatus: z.enum(["valid", "expiring", "expired", "refreshing"]),
    })
  ),
  meta: z
    .object({
      generatedAt: z.string(),
      filters: z.object({
        provider: z.string().nullable(),
        connectionId: z.string().nullable(),
      }),
      totalProviders: z.number(),
    })
    .optional(),
});
var checkQuotaTool = {
  name: "omniroute_check_quota",
  description:
    "Checks the remaining API quota for one or all providers. Returns quota used/total, percentage remaining, reset time, and token health status.",
  inputSchema: checkQuotaInput,
  outputSchema: checkQuotaOutput,
  scopes: ["read:quota"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/usage/quota", "/api/token-health", "/api/rate-limits"],
};
var routeRequestInput = z.object({
  model: z.string().describe("Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')"),
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .describe("Chat messages in OpenAI format"),
  combo: z.string().optional().describe("Specific combo to route through"),
  budget: z.number().optional().describe("Maximum cost in USD for this request"),
  role: z
    .enum(["coding", "review", "planning", "analysis"])
    .optional()
    .describe("Task role hint for intelligent routing"),
  stream: z.boolean().optional().default(false).describe("Whether to stream the response"),
});
var routeRequestOutput = z.object({
  response: z.object({
    content: z.string(),
    model: z.string(),
    tokens: z.object({
      prompt: z.number(),
      completion: z.number(),
    }),
  }),
  routing: z.object({
    provider: z.string(),
    combo: z.string().nullable(),
    fallbacksTriggered: z.number(),
    cost: z.number(),
    latencyMs: z.number(),
    routingExplanation: z.string(),
  }),
});
var routeRequestTool = {
  name: "omniroute_route_request",
  description:
    "Sends a chat completion request through OmniRoute's intelligent routing pipeline. Supports combo selection, budget limits, and task role hints for optimal provider matching.",
  inputSchema: routeRequestInput,
  outputSchema: routeRequestOutput,
  scopes: ["execute:completions"],
  auditLevel: "full",
  phase: 1,
  sourceEndpoints: ["/v1/chat/completions", "/v1/responses"],
};
var costReportInput = z.object({
  period: z
    .enum(["session", "day", "week", "month"])
    .optional()
    .default("session")
    .describe("Time period for the cost report"),
});
var costReportOutput = z.object({
  period: z.string(),
  totalCost: z.number(),
  requestCount: z.number(),
  tokenCount: z.object({
    prompt: z.number(),
    completion: z.number(),
  }),
  byProvider: z.array(
    z.object({
      name: z.string(),
      cost: z.number(),
      requests: z.number(),
    })
  ),
  byModel: z.array(
    z.object({
      model: z.string(),
      cost: z.number(),
      requests: z.number(),
    })
  ),
  budget: z.object({
    limit: z.number().nullable(),
    remaining: z.number().nullable(),
  }),
});
var costReportTool = {
  name: "omniroute_cost_report",
  description:
    "Generates a cost report for the specified period showing total cost, request count, token usage, and breakdowns by provider and model. Also shows budget status if configured.",
  inputSchema: costReportInput,
  outputSchema: costReportOutput,
  scopes: ["read:usage"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/usage/analytics", "/api/usage/budget"],
};
var listModelsCatalogInput = z.object({
  provider: z.string().optional().describe("Filter by provider name"),
  capability: z
    .enum(["chat", "embedding", "image", "audio", "video", "rerank", "moderation"])
    .optional()
    .describe("Filter by model capability"),
});
var listModelsCatalogOutput = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      capabilities: z.array(z.string()),
      status: z.enum(["available", "degraded", "unavailable"]),
      pricing: z
        .object({
          inputPerMillion: z.number().nullable(),
          outputPerMillion: z.number().nullable(),
        })
        .optional(),
    })
  ),
});
var listModelsCatalogTool = {
  name: "omniroute_list_models_catalog",
  description:
    "Lists all available AI models across all providers with their capabilities, current status, and pricing information.",
  inputSchema: listModelsCatalogInput,
  outputSchema: listModelsCatalogOutput,
  scopes: ["read:models"],
  auditLevel: "none",
  phase: 1,
  sourceEndpoints: ["/api/models/catalog", "/v1/models"],
};
var webSearchInput = z.object({
  query: z
    .string()
    .min(1, "Query is required")
    .max(1e3, "Query must be 1000 characters or fewer")
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
    .string()
    .optional()
    .describe("Specific search provider to use (serper, brave, perplexity, exa, tavily)"),
});
var webSearchOutput = z.object({
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
var webSearchTool = {
  name: "omniroute_web_search",
  description:
    "Performs a web search using OmniRoute's search gateway. Supports multiple providers (Serper, Brave, Perplexity, Exa, Tavily) with automatic failover. Returns search results with titles, URLs, snippets, and position data.",
  inputSchema: webSearchInput,
  outputSchema: webSearchOutput,
  scopes: ["execute:search"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/v1/search"],
};
var simulateRouteInput = z.object({
  model: z.string().describe("Target model for simulation"),
  promptTokenEstimate: z.number().describe("Estimated prompt token count"),
  combo: z.string().optional().describe("Specific combo to simulate (default: active combo)"),
});
var simulateRouteOutput = z.object({
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
var simulateRouteTool = {
  name: "omniroute_simulate_route",
  description:
    "Simulates (dry-run) the routing path a request would take without actually executing it. Shows the fallback tree, provider probabilities, estimated costs, and health status.",
  inputSchema: simulateRouteInput,
  outputSchema: simulateRouteOutput,
  scopes: ["read:health", "read:combos"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/monitoring/health", "/api/resilience"],
};
var setBudgetGuardInput = z.object({
  maxCost: z.number().describe("Maximum cost in USD for this session"),
  action: z.enum(["degrade", "block", "alert"]).describe("Action when budget is exceeded"),
  degradeToTier: z
    .enum(["cheap", "free"])
    .optional()
    .describe("If action=degrade, which tier to fall back to"),
});
var setBudgetGuardOutput = z.object({
  sessionId: z.string(),
  budgetTotal: z.number(),
  budgetSpent: z.number(),
  budgetRemaining: z.number(),
  action: z.string(),
  status: z.enum(["active", "warning", "exceeded"]),
});
var setBudgetGuardTool = {
  name: "omniroute_set_budget_guard",
  description:
    "Sets a budget guard that limits spending for the current session. When the budget is reached, it can degrade to cheaper models, block requests, or send alerts.",
  inputSchema: setBudgetGuardInput,
  outputSchema: setBudgetGuardOutput,
  scopes: ["write:budget"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/usage/budget"],
};
var setRoutingStrategyInput = z.object({
  comboId: z.string().describe("Combo ID or name to update"),
  strategy: z
    .enum([
      "priority",
      "weighted",
      "round-robin",
      "strict-random",
      "random",
      "least-used",
      "cost-optimized",
      "auto",
    ])
    .describe("Routing strategy to apply"),
  autoRoutingStrategy: z
    .enum(["rules", "cost", "eco", "latency", "fast"])
    .optional()
    .describe("Optional strategy used by auto mode (only used when strategy='auto')"),
});
var setRoutingStrategyOutput = z.object({
  success: z.boolean(),
  combo: z.object({
    id: z.string(),
    name: z.string(),
    strategy: z.string(),
    autoRoutingStrategy: z.string().nullable(),
  }),
});
var setRoutingStrategyTool = {
  name: "omniroute_set_routing_strategy",
  description:
    "Updates a combo routing strategy (priority/weighted/auto/etc.) at runtime. Supports selecting the sub-strategy used by auto mode (rules/cost/latency).",
  inputSchema: setRoutingStrategyInput,
  outputSchema: setRoutingStrategyOutput,
  scopes: ["write:combos"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/combos/{id}"],
};
var setResilienceProfileInput = z.object({
  profile: z
    .enum(["aggressive", "balanced", "conservative"])
    .describe("Resilience profile to apply"),
});
var setResilienceProfileOutput = z.object({
  applied: z.boolean(),
  settings: z.object({
    circuitBreakerThreshold: z.number(),
    retryCount: z.number(),
    timeoutMs: z.number(),
    fallbackDepth: z.number(),
  }),
});
var setResilienceProfileTool = {
  name: "omniroute_set_resilience_profile",
  description:
    "Applies a resilience profile that adjusts circuit breaker thresholds, retry counts, timeouts, and fallback depth. 'aggressive' = fast fail, 'conservative' = max retries.",
  inputSchema: setResilienceProfileInput,
  outputSchema: setResilienceProfileOutput,
  scopes: ["write:resilience"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/resilience"],
};
var testComboInput = z.object({
  comboId: z.string().describe("ID of the combo to test"),
  testPrompt: z.string().max(500).describe("Short test prompt (max 500 chars)"),
});
var testComboOutput = z.object({
  results: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      success: z.boolean(),
      latencyMs: z.number(),
      cost: z.number(),
      tokenCount: z.number(),
      error: z.string().optional(),
    })
  ),
  summary: z.object({
    totalProviders: z.number(),
    successful: z.number(),
    fastestProvider: z.string(),
    cheapestProvider: z.string(),
  }),
});
var testComboTool = {
  name: "omniroute_test_combo",
  description:
    "Tests a combo by sending a short test prompt to each provider in the combo and reporting individual results including latency, cost, and success status.",
  inputSchema: testComboInput,
  outputSchema: testComboOutput,
  scopes: ["execute:completions", "read:combos"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/combos/test", "/v1/chat/completions"],
};
var getProviderMetricsInput = z.object({
  provider: z.string().describe("Provider name (e.g., 'claude', 'gemini-cli', 'codex')"),
});
var getProviderMetricsOutput = z.object({
  provider: z.string(),
  successRate: z.number(),
  requestCount: z.number(),
  avgLatencyMs: z.number(),
  p50LatencyMs: z.number(),
  p95LatencyMs: z.number(),
  p99LatencyMs: z.number(),
  errorRate: z.number(),
  lastError: z
    .object({
      message: z.string(),
      timestamp: z.string(),
    })
    .nullable(),
  circuitBreakerState: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]),
  quotaInfo: z.object({
    used: z.number(),
    total: z.number().nullable(),
    resetAt: z.string().nullable(),
  }),
});
var getProviderMetricsTool = {
  name: "omniroute_get_provider_metrics",
  description:
    "Returns detailed performance metrics for a specific provider including success/error rates, latency percentiles (p50/p95/p99), circuit breaker state, and quota information.",
  inputSchema: getProviderMetricsInput,
  outputSchema: getProviderMetricsOutput,
  scopes: ["read:health"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/provider-metrics", "/api/resilience"],
};
var bestComboForTaskInput = z.object({
  taskType: z
    .enum(["coding", "review", "planning", "analysis", "debugging", "documentation"])
    .describe("Type of task to find the best combo for"),
  budgetConstraint: z.number().optional().describe("Maximum cost in USD"),
  latencyConstraint: z.number().optional().describe("Maximum acceptable latency in ms"),
});
var bestComboForTaskOutput = z.object({
  recommendedCombo: z.object({
    id: z.string(),
    name: z.string(),
    reason: z.string(),
  }),
  alternatives: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tradeoff: z.string(),
    })
  ),
  freeAlternative: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
});
var bestComboForTaskTool = {
  name: "omniroute_best_combo_for_task",
  description:
    "Recommends the best combo for a given task type (coding, review, planning, etc.) considering budget and latency constraints. Also suggests alternatives and free options.",
  inputSchema: bestComboForTaskInput,
  outputSchema: bestComboForTaskOutput,
  scopes: ["read:combos", "read:health"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/combos/metrics", "/api/monitoring/health"],
};
var explainRouteInput = z.object({
  requestId: z.string().describe("Request ID from the X-Request-Id header"),
});
var explainRouteOutput = z.object({
  requestId: z.string(),
  decision: z.object({
    comboUsed: z.string(),
    providerSelected: z.string(),
    modelUsed: z.string(),
    score: z.number(),
    factors: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
        weight: z.number(),
        contribution: z.number(),
      })
    ),
    fallbacksTriggered: z.array(
      z.object({
        provider: z.string(),
        reason: z.string(),
      })
    ),
    costActual: z.number(),
    latencyActual: z.number(),
  }),
});
var explainRouteTool = {
  name: "omniroute_explain_route",
  description:
    "Explains why a specific request was routed to a particular provider. Shows the scoring factors, weights, fallbacks triggered, actual cost, and latency.",
  inputSchema: explainRouteInput,
  outputSchema: explainRouteOutput,
  scopes: ["read:health", "read:usage"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: [],
};
var getSessionSnapshotInput = z.object({}).describe("No parameters required");
var getSessionSnapshotOutput = z.object({
  sessionStart: z.string(),
  duration: z.string(),
  requestCount: z.number(),
  costTotal: z.number(),
  tokenCount: z.object({
    prompt: z.number(),
    completion: z.number(),
  }),
  topModels: z.array(
    z.object({
      model: z.string(),
      count: z.number(),
    })
  ),
  topProviders: z.array(
    z.object({
      provider: z.string(),
      count: z.number(),
    })
  ),
  errors: z.number(),
  fallbacks: z.number(),
  budgetGuard: z
    .object({
      active: z.boolean(),
      remaining: z.number(),
    })
    .nullable(),
});
var getSessionSnapshotTool = {
  name: "omniroute_get_session_snapshot",
  description:
    "Returns a snapshot of the current working session including duration, request count, total cost, top models/providers used, error count, and budget guard status.",
  inputSchema: getSessionSnapshotInput,
  outputSchema: getSessionSnapshotOutput,
  scopes: ["read:usage"],
  auditLevel: "none",
  phase: 2,
  sourceEndpoints: ["/api/usage/analytics", "/api/telemetry/summary"],
};
var syncPricingInput = z.object({
  sources: z
    .array(z.string())
    .optional()
    .describe("External pricing sources to sync from (default: ['litellm'])"),
  dryRun: z
    .boolean()
    .optional()
    .describe("If true, preview sync results without saving to database"),
});
var syncPricingOutput = z.object({
  success: z.boolean(),
  modelCount: z.number(),
  providerCount: z.number(),
  source: z.string(),
  dryRun: z.boolean(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  data: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});
var syncPricingTool = {
  name: "omniroute_sync_pricing",
  description:
    "Syncs pricing data from external sources (LiteLLM) into OmniRoute. Synced pricing fills gaps not covered by hardcoded defaults without overwriting user-set prices. Use dryRun=true to preview.",
  inputSchema: syncPricingInput,
  outputSchema: syncPricingOutput,
  scopes: ["pricing:write"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/pricing/sync"],
};
var cacheStatsInput = z.object({}).describe("No parameters required");
var cacheStatsOutput = z.object({
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
var cacheStatsTool = {
  name: "omniroute_cache_stats",
  description:
    "Returns cache statistics including semantic cache hit rate, prompt cache metrics by provider, and idempotency layer stats.",
  inputSchema: cacheStatsInput,
  outputSchema: cacheStatsOutput,
  scopes: ["read:cache"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/cache"],
};
var cacheFlushInput = z.object({
  signature: z.string().optional().describe("Specific cache signature to invalidate"),
  model: z.string().optional().describe("Invalidate all entries for a specific model"),
});
var cacheFlushOutput = z.object({
  ok: z.boolean(),
  invalidated: z.number().optional(),
  scope: z.string().optional(),
});
var cacheFlushTool = {
  name: "omniroute_cache_flush",
  description:
    "Flush cache entries. Provide signature to invalidate a single entry, model to invalidate all entries for a model, or omit both to clear all.",
  inputSchema: cacheFlushInput,
  outputSchema: cacheFlushOutput,
  scopes: ["write:cache"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/cache"],
};
var MCP_TOOLS = [
  getHealthTool,
  listCombosTool,
  getComboMetricsTool,
  switchComboTool,
  checkQuotaTool,
  routeRequestTool,
  costReportTool,
  listModelsCatalogTool,
  webSearchTool,
  simulateRouteTool,
  setBudgetGuardTool,
  setRoutingStrategyTool,
  setResilienceProfileTool,
  testComboTool,
  getProviderMetricsTool,
  bestComboForTaskTool,
  explainRouteTool,
  getSessionSnapshotTool,
  syncPricingTool,
  cacheStatsTool,
  cacheFlushTool,
];
var MCP_ESSENTIAL_TOOLS = MCP_TOOLS.filter((t) => t.phase === 1);
var MCP_ADVANCED_TOOLS = MCP_TOOLS.filter((t) => t.phase === 2);
var MCP_TOOL_MAP = Object.fromEntries(MCP_TOOLS.map((t) => [t.name, t]));

// open-sse/mcp-server/runtimeHeartbeat.ts
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var HEARTBEAT_FILE = "mcp-heartbeat.json";
var RUNTIME_DIR = "runtime";
var DEFAULT_INTERVAL_MS = 5e3;
function resolveDataDir() {
  const configured = process.env.DATA_DIR;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return join(homedir(), ".omniroute");
}
function resolveMcpHeartbeatPath() {
  return join(resolveDataDir(), RUNTIME_DIR, HEARTBEAT_FILE);
}
async function writeHeartbeat(snapshot) {
  const heartbeatPath = resolveMcpHeartbeatPath();
  const runtimeDir = join(resolveDataDir(), RUNTIME_DIR);
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(heartbeatPath, JSON.stringify(snapshot, null, 2), "utf-8");
}
function startMcpHeartbeat(config) {
  const startedAt = /* @__PURE__ */ new Date().toISOString();
  let timer = null;
  let stopped = false;
  const intervalMs =
    typeof config.intervalMs === "number" && config.intervalMs > 0
      ? config.intervalMs
      : DEFAULT_INTERVAL_MS;
  const tick = async () => {
    if (stopped) return;
    const snapshot = {
      pid: process.pid,
      startedAt,
      lastHeartbeatAt: /* @__PURE__ */ new Date().toISOString(),
      version: config.version,
      transport: "stdio",
      scopesEnforced: config.scopesEnforced,
      allowedScopes: [...config.allowedScopes],
      toolCount: config.toolCount,
    };
    try {
      await writeHeartbeat(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[MCP Heartbeat] Failed to write heartbeat:", message);
    }
  };
  void tick();
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  return () => {
    if (stopped) return;
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    void tick();
  };
}

// open-sse/mcp-server/schemas/audit.ts
async function hashInput(input) {
  const data = JSON.stringify(input);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function summarizeOutput(output, maxLength = 200) {
  if (output === null || output === void 0) return "(null)";
  const str = typeof output === "string" ? output : JSON.stringify(output);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "\u2026";
}

// open-sse/mcp-server/audit.ts
var db = null;
async function getDb() {
  if (db) return db;
  try {
    const { homedir: homedir2 } = await import("node:os");
    const { join: join2 } = await import("node:path");
    const { existsSync } = await import("node:fs");
    const dbPath = process.env.DATA_DIR
      ? join2(process.env.DATA_DIR, "storage.sqlite")
      : join2(homedir2(), ".omniroute", "storage.sqlite");
    if (!existsSync(dbPath)) {
      console.error(`[MCP Audit] Database not found at ${dbPath} \u2014 audit logging disabled`);
      return null;
    }
    const Database2 = (await import("better-sqlite3")).default;
    db = new Database2(dbPath);
    return db;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP Audit] Failed to connect to database:", message);
    return null;
  }
}
async function logToolCall(toolName, input, output, durationMs, success, errorCode) {
  try {
    const database = await getDb();
    if (!database) return;
    const inputHash = await hashInput(input);
    const outputSummary = summarizeOutput(output);
    const apiKeyId = process.env.OMNIROUTE_API_KEY_ID || null;
    database
      .prepare(
        `INSERT INTO mcp_tool_audit (tool_name, input_hash, output_summary, duration_ms, api_key_id, success, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        toolName,
        inputHash,
        outputSummary,
        durationMs,
        apiKeyId,
        success ? 1 : 0,
        errorCode || null
      );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP Audit] Failed to log:", message);
  }
}

// open-sse/mcp-server/scopeEnforcement.ts
function normalizeScopeList(raw) {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}
function extractMetaScopeList(meta) {
  if (!meta || typeof meta !== "object") return [];
  const metaRecord = meta;
  const direct = normalizeScopeList(metaRecord.scopes);
  if (direct.length > 0) return direct;
  const auth = metaRecord.auth;
  if (auth && typeof auth === "object") {
    const authScopes = normalizeScopeList(auth.scopes);
    if (authScopes.length > 0) return authScopes;
  }
  const omni = metaRecord.omniroute;
  if (omni && typeof omni === "object") {
    const omniScopes = normalizeScopeList(omni.scopes);
    if (omniScopes.length > 0) return omniScopes;
  }
  return [];
}
function scopeMatches(grantedScope, requiredScope) {
  if (grantedScope === "*" || grantedScope === requiredScope) {
    return true;
  }
  if (grantedScope.endsWith("*")) {
    const prefix = grantedScope.slice(0, -1);
    return requiredScope.startsWith(prefix);
  }
  return false;
}
function resolveCallerScopeContext(extra, fallbackScopes = []) {
  const callerId =
    (typeof extra?.authInfo?.clientId === "string" && extra.authInfo.clientId.trim()) ||
    (typeof extra?.sessionId === "string" && extra.sessionId.trim()) ||
    "anonymous";
  const authScopes = normalizeScopeList(extra?.authInfo?.scopes);
  if (authScopes.length > 0) {
    return { callerId, scopes: authScopes, source: "authInfo" };
  }
  const metaScopes = extractMetaScopeList(extra?._meta);
  if (metaScopes.length > 0) {
    return { callerId, scopes: metaScopes, source: "meta" };
  }
  const fallback = normalizeScopeList(fallbackScopes);
  if (fallback.length > 0) {
    return { callerId, scopes: fallback, source: "env" };
  }
  return { callerId, scopes: [], source: "none" };
}
function evaluateToolScopes(toolName, callerScopes, enforceScopes) {
  const toolDef = MCP_TOOL_MAP[toolName];
  if (!toolDef) {
    return {
      allowed: false,
      required: [],
      provided: Array.from(callerScopes),
      missing: [],
      reason: "tool_definition_missing",
    };
  }
  const required = Array.isArray(toolDef.scopes) ? Array.from(toolDef.scopes) : [];
  const provided = normalizeScopeList(callerScopes);
  if (!enforceScopes || required.length === 0) {
    return { allowed: true, required, provided, missing: [] };
  }
  const missing = required.filter(
    (requiredScope) => !provided.some((grantedScope) => scopeMatches(grantedScope, requiredScope))
  );
  return {
    allowed: missing.length === 0,
    required,
    provided,
    missing,
    reason: missing.length > 0 ? "missing_scopes" : void 0,
  };
}

// src/shared/contracts/quota.ts
var TOKEN_STATUS_VALUES = ["valid", "expiring", "expired", "refreshing"];
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function normalizeTokenStatus(value) {
  if (typeof value === "string" && TOKEN_STATUS_VALUES.includes(value)) {
    return value;
  }
  return "valid";
}
function sanitizeQuotaProvider(input) {
  const source = input && typeof input === "object" ? input : {};
  const provider = typeof source.provider === "string" ? source.provider : "unknown";
  const name = typeof source.name === "string" && source.name.trim() ? source.name : provider;
  const connectionId =
    typeof source.connectionId === "string" && source.connectionId.trim()
      ? source.connectionId
      : "unknown";
  const quotaTotalRaw = toNumber(source.quotaTotal);
  const quotaTotal = quotaTotalRaw !== null && quotaTotalRaw >= 0 ? quotaTotalRaw : null;
  const quotaUsedRaw = toNumber(source.quotaUsed) ?? 0;
  const quotaUsed =
    quotaTotal !== null ? clamp(quotaUsedRaw, 0, quotaTotal) : Math.max(0, quotaUsedRaw);
  let percentRemainingRaw = toNumber(source.percentRemaining);
  if (percentRemainingRaw === null) {
    if (quotaTotal && quotaTotal > 0) {
      percentRemainingRaw = ((quotaTotal - quotaUsed) / quotaTotal) * 100;
    } else {
      percentRemainingRaw = 100;
    }
  }
  const percentRemaining = clamp(percentRemainingRaw, 0, 100);
  const resetAt =
    typeof source.resetAt === "string" && source.resetAt.trim() ? source.resetAt : null;
  return {
    name,
    provider,
    connectionId,
    quotaUsed,
    quotaTotal,
    percentRemaining,
    resetAt,
    tokenStatus: normalizeTokenStatus(source.tokenStatus),
  };
}
function normalizeQuotaResponse(raw, filters = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const providersRaw = Array.isArray(source.providers)
    ? source.providers
    : Array.isArray(raw)
      ? raw
      : [];
  const providers = providersRaw.map((entry) => sanitizeQuotaProvider(entry));
  const sourceMeta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const sourceFilters =
    sourceMeta.filters && typeof sourceMeta.filters === "object" ? sourceMeta.filters : {};
  const providerFilter =
    filters.provider ??
    (typeof sourceFilters.provider === "string" && sourceFilters.provider.trim()
      ? sourceFilters.provider
      : null);
  const connectionFilter =
    filters.connectionId ??
    (typeof sourceFilters.connectionId === "string" && sourceFilters.connectionId.trim()
      ? sourceFilters.connectionId
      : null);
  const generatedAt =
    typeof sourceMeta.generatedAt === "string" && sourceMeta.generatedAt.trim()
      ? sourceMeta.generatedAt
      : /* @__PURE__ */ new Date().toISOString();
  return {
    providers,
    meta: {
      generatedAt,
      filters: {
        provider: providerFilter || null,
        connectionId: connectionFilter || null,
      },
      totalProviders: providers.length,
    },
  };
}

// open-sse/mcp-server/tools/advancedTools.ts
var OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128";
var OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY || "";
async function apiFetch(path4, options = {}) {
  const url = `${OMNIROUTE_BASE_URL}${path4}`;
  const headers = {
    "Content-Type": "application/json",
    ...(OMNIROUTE_API_KEY ? { Authorization: `Bearer ${OMNIROUTE_API_KEY}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(3e4) });
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`API [${response.status}]: ${text}`);
  }
  return response.json();
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function toRecord(value) {
  return isRecord(value) ? value : {};
}
function toArrayOfRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function toNumber2(value, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
function getComboModels(combo) {
  const directModels = toArrayOfRecords(combo.models);
  const nestedModels = toArrayOfRecords(toRecord(combo.data).models);
  const sourceModels = directModels.length > 0 ? directModels : nestedModels;
  return sourceModels.map((model) => ({
    provider: toString(model.provider, "unknown"),
    model: toString(model.model, ""),
    inputCostPer1M: toNumber2(model.inputCostPer1M, 3),
  }));
}
function normalizeCombosResponse(raw) {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  const source = toRecord(raw);
  return Array.isArray(source.combos) ? source.combos.filter(isRecord) : [];
}
var activeBudgetGuard = null;
var RESILIENCE_PROFILES = {
  aggressive: {
    profiles: {
      oauth: {
        transientCooldown: 3e3,
        rateLimitCooldown: 3e4,
        maxBackoffLevel: 4,
        circuitBreakerThreshold: 2,
        circuitBreakerReset: 3e4,
      },
      apikey: {
        transientCooldown: 2e3,
        rateLimitCooldown: 0,
        maxBackoffLevel: 3,
        circuitBreakerThreshold: 3,
        circuitBreakerReset: 15e3,
      },
    },
    defaults: {
      requestsPerMinute: 180,
      minTimeBetweenRequests: 100,
      concurrentRequests: 16,
    },
  },
  balanced: {
    profiles: {
      oauth: {
        transientCooldown: 5e3,
        rateLimitCooldown: 6e4,
        maxBackoffLevel: 8,
        circuitBreakerThreshold: 3,
        circuitBreakerReset: 6e4,
      },
      apikey: {
        transientCooldown: 3e3,
        rateLimitCooldown: 0,
        maxBackoffLevel: 5,
        circuitBreakerThreshold: 5,
        circuitBreakerReset: 3e4,
      },
    },
    defaults: {
      requestsPerMinute: 100,
      minTimeBetweenRequests: 200,
      concurrentRequests: 10,
    },
  },
  conservative: {
    profiles: {
      oauth: {
        transientCooldown: 8e3,
        rateLimitCooldown: 12e4,
        maxBackoffLevel: 10,
        circuitBreakerThreshold: 8,
        circuitBreakerReset: 12e4,
      },
      apikey: {
        transientCooldown: 5e3,
        rateLimitCooldown: 3e4,
        maxBackoffLevel: 8,
        circuitBreakerThreshold: 8,
        circuitBreakerReset: 6e4,
      },
    },
    defaults: {
      requestsPerMinute: 60,
      minTimeBetweenRequests: 350,
      concurrentRequests: 6,
    },
  },
};
var TASK_FITNESS = {
  coding: { preferred: ["claude", "deepseek", "codex"], traits: ["fast", "code-optimized"] },
  review: { preferred: ["claude", "gemini", "openai"], traits: ["analytical", "thorough"] },
  planning: { preferred: ["gemini", "claude", "openai"], traits: ["reasoning", "structured"] },
  analysis: { preferred: ["gemini", "claude"], traits: ["deep-reasoning", "large-context"] },
  debugging: { preferred: ["claude", "deepseek", "codex"], traits: ["code-aware", "fast"] },
  documentation: { preferred: ["gemini", "claude", "openai"], traits: ["clear", "structured"] },
};
async function handleSimulateRoute(args) {
  const start = Date.now();
  try {
    const [combosRaw, healthRaw, quotaRaw] = await Promise.allSettled([
      apiFetch("/api/combos"),
      apiFetch("/api/monitoring/health"),
      apiFetch("/api/usage/quota"),
    ]);
    const combos = combosRaw.status === "fulfilled" ? normalizeCombosResponse(combosRaw.value) : [];
    const health = healthRaw.status === "fulfilled" ? toRecord(healthRaw.value) : {};
    const quota =
      quotaRaw.status === "fulfilled"
        ? normalizeQuotaResponse(quotaRaw.value)
        : normalizeQuotaResponse({});
    const targetCombo = args.combo
      ? combos.find(
          (combo) => toString(combo.id) === args.combo || toString(combo.name) === args.combo
        )
      : combos.find((combo) => combo.enabled !== false);
    if (!targetCombo) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No matching combo found" }) }],
        isError: true,
      };
    }
    const models = getComboModels(targetCombo);
    const breakers = toArrayOfRecords(health.circuitBreakers);
    const providers = quota.providers;
    const simulatedPath = models.map((model, idx) => {
      const cb = breakers.find((breaker) => toString(breaker.provider) === model.provider);
      const q = providers.find((providerEntry) => providerEntry.provider === model.provider);
      const estimatedCost = (args.promptTokenEstimate / 1e6) * model.inputCostPer1M;
      return {
        provider: model.provider,
        model: model.model || args.model,
        probability: idx === 0 ? 0.85 : 0.15 / Math.max(models.length - 1, 1),
        estimatedCost: Math.round(estimatedCost * 1e4) / 1e4,
        healthStatus: toString(cb?.state, "CLOSED"),
        quotaAvailable: q?.percentRemaining ?? 100,
      };
    });
    const costs = simulatedPath.map((pathEntry) => pathEntry.estimatedCost);
    const result = {
      simulatedPath,
      fallbackTree: {
        primary: simulatedPath[0]?.provider || "unknown",
        fallbacks: simulatedPath.slice(1).map((pathEntry) => pathEntry.provider),
        worstCaseCost: Math.max(...costs, 0),
        bestCaseCost: Math.min(...costs, 0),
      },
    };
    await logToolCall("omniroute_simulate_route", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_simulate_route", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSetBudgetGuard(args) {
  const start = Date.now();
  try {
    let spent = 0;
    try {
      const analytics = toRecord(await apiFetch("/api/usage/analytics?period=session"));
      spent = toNumber2(analytics.totalCost, 0);
    } catch {}
    activeBudgetGuard = {
      sessionId: `budget_${Date.now()}`,
      maxCost: args.maxCost,
      action: args.action,
      degradeToTier: args.degradeToTier,
      spent,
      createdAt: /* @__PURE__ */ new Date().toISOString(),
    };
    const remaining = Math.max(0, args.maxCost - spent);
    const result = {
      sessionId: activeBudgetGuard.sessionId,
      budgetTotal: args.maxCost,
      budgetSpent: Math.round(spent * 1e4) / 1e4,
      budgetRemaining: Math.round(remaining * 1e4) / 1e4,
      action: args.action,
      status: remaining <= 0 ? "exceeded" : remaining < args.maxCost * 0.2 ? "warning" : "active",
    };
    await logToolCall(
      "omniroute_set_budget_guard",
      { maxCost: args.maxCost, action: args.action },
      result,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_set_budget_guard", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSetRoutingStrategy(args) {
  const start = Date.now();
  try {
    const combos = normalizeCombosResponse(await apiFetch("/api/combos"));
    const combo = combos.find(
      (comboEntry) =>
        toString(comboEntry.id) === args.comboId || toString(comboEntry.name) === args.comboId
    );
    if (!combo) {
      const msg = `Combo '${args.comboId}' not found`;
      await logToolCall(
        "omniroute_set_routing_strategy",
        args,
        null,
        Date.now() - start,
        false,
        msg
      );
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
    const comboId = toString(combo.id);
    if (!comboId) {
      const msg = "Matched combo has no id";
      await logToolCall(
        "omniroute_set_routing_strategy",
        args,
        null,
        Date.now() - start,
        false,
        msg
      );
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
    const comboData = toRecord(combo.data);
    const currentConfig = toRecord(
      Object.keys(toRecord(combo.config)).length > 0 ? combo.config : comboData.config
    );
    let nextConfig = void 0;
    if (args.strategy === "auto" && args.autoRoutingStrategy) {
      const currentAutoConfig = toRecord(currentConfig.auto);
      nextConfig = {
        ...currentConfig,
        auto: {
          ...currentAutoConfig,
          routingStrategy: args.autoRoutingStrategy,
        },
      };
    }
    const payload = { strategy: args.strategy };
    if (nextConfig && Object.keys(nextConfig).length > 0) {
      payload.config = nextConfig;
    }
    const updatedCombo = toRecord(
      await apiFetch(`/api/combos/${encodeURIComponent(comboId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    );
    const updatedConfig = toRecord(updatedCombo.config);
    const resolvedAutoStrategy =
      toString(toRecord(updatedConfig.auto).routingStrategy) ||
      (args.strategy === "auto" ? (args.autoRoutingStrategy ?? "rules") : "");
    const result = {
      success: true,
      combo: {
        id: toString(updatedCombo.id, comboId),
        name: toString(updatedCombo.name, toString(combo.name, comboId)),
        strategy: toString(updatedCombo.strategy, args.strategy),
        autoRoutingStrategy:
          toString(updatedCombo.strategy, args.strategy) === "auto" ? resolvedAutoStrategy : null,
      },
    };
    await logToolCall("omniroute_set_routing_strategy", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_set_routing_strategy", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSetResilienceProfile(args) {
  const start = Date.now();
  try {
    const settings = RESILIENCE_PROFILES[args.profile];
    if (!settings) {
      return {
        content: [{ type: "text", text: `Error: Invalid profile "${args.profile}"` }],
        isError: true,
      };
    }
    await apiFetch("/api/resilience", {
      method: "PATCH",
      body: JSON.stringify({
        profiles: settings.profiles,
        defaults: settings.defaults,
      }),
    });
    const result = { applied: true, profile: args.profile, settings };
    await logToolCall("omniroute_set_resilience_profile", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall(
      "omniroute_set_resilience_profile",
      args,
      null,
      Date.now() - start,
      false,
      msg
    );
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleTestCombo(args) {
  const start = Date.now();
  try {
    const combos = normalizeCombosResponse(await apiFetch("/api/combos"));
    const combo = combos.find(
      (comboEntry) =>
        toString(comboEntry.id) === args.comboId || toString(comboEntry.name) === args.comboId
    );
    if (!combo) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Combo "${args.comboId}" not found` }),
          },
        ],
        isError: true,
      };
    }
    const models = getComboModels(combo);
    const prompt = (args.testPrompt || "Say hello").slice(0, 200);
    const results = await Promise.allSettled(
      models.map(async (model) => {
        const providerStart = Date.now();
        try {
          const resp = toRecord(
            await apiFetch("/v1/chat/completions", {
              method: "POST",
              body: JSON.stringify({
                model: model.model || "auto",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 50,
                stream: false,
                "x-provider": model.provider,
              }),
            })
          );
          const usage = toRecord(resp.usage);
          return {
            provider: model.provider,
            model: model.model || toString(resp.model, "unknown"),
            success: true,
            latencyMs: Date.now() - providerStart,
            cost: toNumber2(resp.cost, 0),
            tokenCount: toNumber2(usage.prompt_tokens, 0) + toNumber2(usage.completion_tokens, 0),
          };
        } catch (err) {
          return {
            provider: model.provider,
            model: model.model || "unknown",
            success: false,
            latencyMs: Date.now() - providerStart,
            cost: 0,
            tokenCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    const providerResults = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : {
            provider: "unknown",
            model: "unknown",
            success: false,
            latencyMs: 0,
            cost: 0,
            tokenCount: 0,
            error: "Promise rejected",
          }
    );
    const successful = providerResults.filter((r) => r.success);
    const fastest = successful.sort((a, b) => a.latencyMs - b.latencyMs)[0];
    const cheapest = successful.sort((a, b) => a.cost - b.cost)[0];
    const result = {
      results: providerResults,
      summary: {
        totalProviders: providerResults.length,
        successful: successful.length,
        fastestProvider: fastest?.provider || "none",
        cheapestProvider: cheapest?.provider || "none",
      },
    };
    await logToolCall(
      "omniroute_test_combo",
      { comboId: args.comboId },
      result.summary,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_test_combo", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleGetProviderMetrics(args) {
  const start = Date.now();
  try {
    const [healthRaw, quotaRaw, analyticsRaw] = await Promise.allSettled([
      apiFetch("/api/monitoring/health"),
      apiFetch(`/api/usage/quota?provider=${encodeURIComponent(args.provider)}`),
      apiFetch(`/api/usage/analytics?period=session&provider=${encodeURIComponent(args.provider)}`),
    ]);
    const health = healthRaw.status === "fulfilled" ? toRecord(healthRaw.value) : {};
    const quota =
      quotaRaw.status === "fulfilled"
        ? normalizeQuotaResponse(quotaRaw.value, { provider: args.provider })
        : normalizeQuotaResponse({});
    const analytics = analyticsRaw.status === "fulfilled" ? toRecord(analyticsRaw.value) : {};
    const cb = toArrayOfRecords(health.circuitBreakers).find(
      (breaker) => toString(breaker.provider) === args.provider
    );
    const providerQuota = quota.providers.find((p) => p.provider === args.provider) || null;
    const result = {
      provider: args.provider,
      successRate: toNumber2(analytics.successRate, 1),
      requestCount: toNumber2(analytics.requestCount, 0),
      avgLatencyMs: toNumber2(analytics.avgLatencyMs, 0),
      p50LatencyMs: toNumber2(analytics.p50LatencyMs, 0),
      p95LatencyMs: toNumber2(analytics.p95LatencyMs, 0),
      p99LatencyMs: toNumber2(analytics.p99LatencyMs, 0),
      errorRate: toNumber2(analytics.errorRate, 0),
      lastError: toString(analytics.lastError) || null,
      circuitBreakerState: toString(cb?.state, "CLOSED"),
      quotaInfo: providerQuota
        ? {
            used: providerQuota.quotaUsed,
            total: providerQuota.quotaTotal,
            resetAt: providerQuota.resetAt,
          }
        : { used: 0, total: null, resetAt: null },
    };
    await logToolCall("omniroute_get_provider_metrics", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_provider_metrics", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleBestComboForTask(args) {
  const start = Date.now();
  try {
    const fitness = TASK_FITNESS[args.taskType] || TASK_FITNESS.coding;
    const combos = normalizeCombosResponse(await apiFetch("/api/combos"));
    const enabledCombos = combos.filter((combo) => combo.enabled !== false);
    if (enabledCombos.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No enabled combos available" }) }],
        isError: true,
      };
    }
    const scored = enabledCombos.map((combo) => {
      const models = getComboModels(combo);
      let score = 0;
      for (const model of models) {
        const prefIdx = fitness.preferred.indexOf(model.provider);
        if (prefIdx >= 0) score += (fitness.preferred.length - prefIdx) * 10;
      }
      const name = toString(combo.name).toLowerCase();
      for (const trait of fitness.traits) {
        if (name.includes(trait)) score += 5;
      }
      const isFree =
        name.includes("free") ||
        models.every((model) => model.provider.toLowerCase().includes("free"));
      return { combo, score, isFree };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const alternatives = scored.slice(1, 4).map((s) => ({
      id: s.combo.id,
      name: s.combo.name,
      tradeoff: s.isFree
        ? "free but may have limits"
        : s.score < best.score * 0.5
          ? "cheaper but slower"
          : "similar quality, different providers",
    }));
    const freeAlt = scored.find((s) => s.isFree && s !== best);
    const result = {
      recommendedCombo: {
        id: best.combo.id,
        name: best.combo.name,
        reason: `Best match for "${args.taskType}": preferred providers (${fitness.preferred.slice(0, 3).join(", ")})`,
      },
      alternatives,
      freeAlternative: freeAlt ? { id: freeAlt.combo.id, name: freeAlt.combo.name } : null,
    };
    await logToolCall(
      "omniroute_best_combo_for_task",
      args,
      result.recommendedCombo,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_best_combo_for_task", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleExplainRoute(args) {
  const start = Date.now();
  try {
    let decision = null;
    try {
      decision = toRecord(
        await apiFetch(`/api/routing/decisions/${encodeURIComponent(args.requestId)}`)
      );
    } catch {}
    const result = decision
      ? {
          requestId: args.requestId,
          decision: {
            comboUsed: decision.comboUsed || "default",
            providerSelected: decision.providerSelected || "unknown",
            modelUsed: decision.modelUsed || "unknown",
            score: decision.score || 0,
            factors: decision.factors || [
              { name: "health", value: 1, weight: 0.3, contribution: 0.3 },
              { name: "quota", value: 1, weight: 0.25, contribution: 0.25 },
              { name: "cost", value: 0.8, weight: 0.2, contribution: 0.16 },
              { name: "latency", value: 0.9, weight: 0.15, contribution: 0.135 },
              { name: "task_fit", value: 0.7, weight: 0.1, contribution: 0.07 },
            ],
            fallbacksTriggered: decision.fallbacksTriggered || [],
            costActual: decision.costActual || 0,
            latencyActual: decision.latencyActual || 0,
          },
        }
      : {
          requestId: args.requestId,
          decision: {
            comboUsed: "unknown",
            providerSelected: "unknown",
            modelUsed: "unknown",
            score: 0,
            factors: [],
            fallbacksTriggered: [],
            costActual: 0,
            latencyActual: 0,
          },
          note: "Routing decision not found. The /api/routing/decisions endpoint may not be implemented yet, or the requestId is invalid.",
        };
    await logToolCall(
      "omniroute_explain_route",
      args,
      { requestId: args.requestId },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_explain_route", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSyncPricing(args) {
  const start = Date.now();
  try {
    const result = toRecord(
      await apiFetch("/api/pricing/sync", {
        method: "POST",
        body: JSON.stringify({
          sources: args.sources,
          dryRun: args.dryRun ?? false,
        }),
      })
    );
    await logToolCall("omniroute_sync_pricing", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_sync_pricing", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleGetSessionSnapshot() {
  const start = Date.now();
  try {
    const analytics = toRecord(
      await apiFetch("/api/usage/analytics?period=session").catch(() => ({}))
    );
    const tokenCount = toRecord(analytics.tokenCount);
    const byModel = toArrayOfRecords(analytics.byModel);
    const byProvider = toArrayOfRecords(analytics.byProvider);
    const result = {
      sessionStart: toString(analytics.sessionStart, /* @__PURE__ */ new Date().toISOString()),
      duration: toString(analytics.duration, "unknown"),
      requestCount: toNumber2(analytics.requestCount, 0),
      costTotal: toNumber2(analytics.totalCost, 0),
      tokenCount: {
        prompt: toNumber2(tokenCount.prompt, 0),
        completion: toNumber2(tokenCount.completion, 0),
      },
      topModels: byModel.slice(0, 5).map((model) => ({
        model: toString(model.model, "unknown"),
        count: toNumber2(model.requests, 0),
      })),
      topProviders: byProvider.slice(0, 5).map((provider) => ({
        provider: toString(provider.name, "unknown"),
        count: toNumber2(provider.requests, 0),
      })),
      errors: toNumber2(analytics.errorCount, 0),
      fallbacks: toNumber2(analytics.fallbackCount, 0),
      budgetGuard: activeBudgetGuard
        ? {
            active: true,
            remaining: Math.max(0, activeBudgetGuard.maxCost - activeBudgetGuard.spent),
            action: activeBudgetGuard.action,
          }
        : null,
    };
    await logToolCall(
      "omniroute_get_session_snapshot",
      {},
      { requestCount: result.requestCount },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_session_snapshot", {}, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

// open-sse/mcp-server/tools/memoryTools.ts
import { z as z3 } from "zod";

// src/lib/db/core.ts
import Database from "better-sqlite3";
import path3 from "path";
import fs3 from "fs";

// src/lib/dataPaths.ts
import path from "path";
import os from "os";
var APP_NAME = "omniroute";
function safeHomeDir() {
  try {
    return os.homedir();
  } catch {
    return process.cwd();
  }
}
function normalizeConfiguredPath(dir) {
  if (typeof dir !== "string") return null;
  const trimmed = dir.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}
function getLegacyDotDataDir() {
  return path.join(safeHomeDir(), `.${APP_NAME}`);
}
function getDefaultDataDir() {
  const homeDir = safeHomeDir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }
  const xdgConfigHome = normalizeConfiguredPath(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, APP_NAME);
  }
  return getLegacyDotDataDir();
}
function resolveDataDir2({ isCloud: isCloud2 = false } = {}) {
  if (isCloud2) return "/tmp";
  const configured = normalizeConfiguredPath(process.env.DATA_DIR);
  if (configured) return configured;
  return getDefaultDataDir();
}

// src/lib/db/migrationRunner.ts
import fs2 from "fs";
import path2 from "path";
import { fileURLToPath } from "url";
function resolveMigrationsDir() {
  try {
    const metaUrl = import.meta.url;
    if (metaUrl && metaUrl.startsWith("file://")) {
      const __filename = fileURLToPath(metaUrl);
      return path2.join(path2.dirname(__filename), "migrations");
    }
  } catch {}
  return path2.join(process.cwd(), "src", "lib", "db", "migrations");
}
var MIGRATIONS_DIR = resolveMigrationsDir();
function ensureMigrationsTable(db2) {
  db2.exec(`
    CREATE TABLE IF NOT EXISTS _omniroute_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
function getMigrationFiles() {
  if (!fs2.existsSync(MIGRATIONS_DIR)) return [];
  return fs2
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        version: match[1],
        name: match[2],
        path: path2.join(MIGRATIONS_DIR, filename),
      };
    })
    .filter(Boolean);
}
function getAppliedVersions(db2) {
  const rows = db2.prepare("SELECT version FROM _omniroute_migrations").all();
  return new Set(rows.map((r) => r.version));
}
function runMigrations(db2) {
  ensureMigrationsTable(db2);
  const files = getMigrationFiles();
  const applied = getAppliedVersions(db2);
  let count = 0;
  for (const migration of files) {
    if (applied.has(migration.version)) continue;
    const sql = fs2.readFileSync(migration.path, "utf-8");
    const applyMigration = db2.transaction(() => {
      db2.exec(sql);
      db2
        .prepare("INSERT INTO _omniroute_migrations (version, name) VALUES (?, ?)")
        .run(migration.version, migration.name);
    });
    try {
      applyMigration();
      count++;
      console.log(`[Migration] Applied: ${migration.version}_${migration.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Migration] FAILED: ${migration.version}_${migration.name} \u2014 ${message}`);
      throw err;
    }
  }
  if (count > 0) {
    console.log(`[Migration] ${count} migration(s) applied successfully.`);
  }
  return count;
}

// src/lib/db/core.ts
var isCloud = typeof globalThis.caches === "object" && globalThis.caches !== null;
var isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
var DATA_DIR = resolveDataDir2({ isCloud });
var LEGACY_DATA_DIR = isCloud ? null : getLegacyDotDataDir();
var SQLITE_FILE = isCloud ? null : path3.join(DATA_DIR, "storage.sqlite");
var JSON_DB_FILE = isCloud ? null : path3.join(DATA_DIR, "db.json");
var DB_BACKUPS_DIR = isCloud ? null : path3.join(DATA_DIR, "db_backups");
if (!isCloud && !fs3.existsSync(DATA_DIR)) {
  try {
    fs3.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[DB] Cannot create data directory '${DATA_DIR}': ${msg}
[DB] Set the DATA_DIR environment variable to a writable path, e.g.:
[DB]   DATA_DIR=/path/to/writable/dir omniroute`
    );
  }
}
var SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS provider_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    auth_type TEXT,
    name TEXT,
    email TEXT,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    token_expires_at TEXT,
    scope TEXT,
    project_id TEXT,
    test_status TEXT,
    error_code TEXT,
    last_error TEXT,
    last_error_at TEXT,
    last_error_type TEXT,
    last_error_source TEXT,
    backoff_level INTEGER DEFAULT 0,
    rate_limited_until TEXT,
    health_check_interval INTEGER,
    last_health_check_at TEXT,
    last_tested TEXT,
    api_key TEXT,
    id_token TEXT,
    provider_specific_data TEXT,
    expires_in INTEGER,
    display_name TEXT,
    global_priority INTEGER,
    default_model TEXT,
    token_type TEXT,
    consecutive_use_count INTEGER DEFAULT 0,
    rate_limit_protection INTEGER DEFAULT 0,
    last_used_at TEXT,
    "group" TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider);
  CREATE INDEX IF NOT EXISTS idx_pc_active ON provider_connections(is_active);
  CREATE INDEX IF NOT EXISTS idx_pc_priority ON provider_connections(provider, priority);

  CREATE TABLE IF NOT EXISTS provider_nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    prefix TEXT,
    api_type TEXT,
    base_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS key_value (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );

  CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    machine_id TEXT,
    allowed_models TEXT DEFAULT '[]',
    no_log INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ak_key ON api_keys(key);

  CREATE TABLE IF NOT EXISTS db_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT,
    model TEXT,
    connection_id TEXT,
    api_key_id TEXT,
    api_key_name TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_creation INTEGER DEFAULT 0,
    tokens_reasoning INTEGER DEFAULT 0,
    status TEXT,
    success INTEGER DEFAULT 1,
    latency_ms INTEGER DEFAULT 0,
    ttft_ms INTEGER DEFAULT 0,
    error_code TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_uh_timestamp ON usage_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_uh_provider ON usage_history(provider);
  CREATE INDEX IF NOT EXISTS idx_uh_model ON usage_history(model);

  CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    method TEXT,
    path TEXT,
    status INTEGER,
    model TEXT,
    provider TEXT,
    account TEXT,
    connection_id TEXT,
    duration INTEGER DEFAULT 0,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    source_format TEXT,
    target_format TEXT,
    api_key_id TEXT,
    api_key_name TEXT,
    combo_name TEXT,
    request_body TEXT,
    response_body TEXT,
    error TEXT,
    artifact_relpath TEXT,
    has_pipeline_details INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_cl_timestamp ON call_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_cl_status ON call_logs(status);

  CREATE TABLE IF NOT EXISTS proxy_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    status TEXT,
    proxy_type TEXT,
    proxy_host TEXT,
    proxy_port INTEGER,
    level TEXT,
    level_id TEXT,
    provider TEXT,
    target_url TEXT,
    public_ip TEXT,
    latency_ms INTEGER DEFAULT 0,
    error TEXT,
    connection_id TEXT,
    combo_id TEXT,
    account TEXT,
    tls_fingerprint INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_pl_timestamp ON proxy_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_pl_status ON proxy_logs(status);
  CREATE INDEX IF NOT EXISTS idx_pl_provider ON proxy_logs(provider);

  -- Domain State Persistence (Phase 5)
  CREATE TABLE IF NOT EXISTS domain_fallback_chains (
    model TEXT PRIMARY KEY,
    chain TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domain_budgets (
    api_key_id TEXT PRIMARY KEY,
    daily_limit_usd REAL NOT NULL,
    monthly_limit_usd REAL DEFAULT 0,
    warning_threshold REAL DEFAULT 0.8
  );

  CREATE TABLE IF NOT EXISTS domain_cost_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT NOT NULL,
    cost REAL NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dch_key ON domain_cost_history(api_key_id);
  CREATE INDEX IF NOT EXISTS idx_dch_ts ON domain_cost_history(timestamp);

  CREATE TABLE IF NOT EXISTS domain_lockout_state (
    identifier TEXT PRIMARY KEY,
    attempts TEXT NOT NULL,
    locked_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS domain_circuit_breakers (
    name TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'CLOSED',
    failure_count INTEGER DEFAULT 0,
    last_failure_time INTEGER,
    options TEXT
  );

  CREATE TABLE IF NOT EXISTS semantic_cache (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    tokens_saved INTEGER DEFAULT 0,
    hit_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sc_sig ON semantic_cache(signature);
  CREATE INDEX IF NOT EXISTS idx_sc_model ON semantic_cache(model);
`;
function getDb2() {
  return globalThis.__omnirouteDb ?? null;
}
function setDb(db2) {
  if (db2) {
    globalThis.__omnirouteDb = db2;
  } else {
    delete globalThis.__omnirouteDb;
  }
}
function ensureProviderConnectionsColumns(db2) {
  try {
    const columns = db2.prepare("PRAGMA table_info(provider_connections)").all();
    const columnNames = new Set(columns.map((column) => String(column.name ?? "")));
    if (!columnNames.has("rate_limit_protection")) {
      db2.exec(
        "ALTER TABLE provider_connections ADD COLUMN rate_limit_protection INTEGER DEFAULT 0"
      );
      console.log("[DB] Added provider_connections.rate_limit_protection column");
    }
    if (!columnNames.has("last_used_at")) {
      db2.exec("ALTER TABLE provider_connections ADD COLUMN last_used_at TEXT");
      console.log("[DB] Added provider_connections.last_used_at column");
    }
    if (!columnNames.has("group")) {
      db2.exec('ALTER TABLE provider_connections ADD COLUMN "group" TEXT');
      console.log('[DB] Added provider_connections."group" column');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[DB] Failed to verify provider_connections schema:", message);
  }
}
function ensureUsageHistoryColumns(db2) {
  try {
    const columns = db2.prepare("PRAGMA table_info(usage_history)").all();
    const columnNames = new Set(columns.map((column) => String(column.name ?? "")));
    if (!columnNames.has("success")) {
      db2.exec("ALTER TABLE usage_history ADD COLUMN success INTEGER DEFAULT 1");
      console.log("[DB] Added usage_history.success column");
    }
    if (!columnNames.has("latency_ms")) {
      db2.exec("ALTER TABLE usage_history ADD COLUMN latency_ms INTEGER DEFAULT 0");
      console.log("[DB] Added usage_history.latency_ms column");
    }
    if (!columnNames.has("ttft_ms")) {
      db2.exec("ALTER TABLE usage_history ADD COLUMN ttft_ms INTEGER DEFAULT 0");
      console.log("[DB] Added usage_history.ttft_ms column");
    }
    if (!columnNames.has("error_code")) {
      db2.exec("ALTER TABLE usage_history ADD COLUMN error_code TEXT");
      console.log("[DB] Added usage_history.error_code column");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[DB] Failed to verify usage_history schema:", message);
  }
}
function ensureCallLogsColumns(db2) {
  try {
    const columns = db2.prepare("PRAGMA table_info(call_logs)").all();
    const columnNames = new Set(columns.map((column) => String(column.name ?? "")));
    if (!columnNames.has("artifact_relpath")) {
      db2.exec("ALTER TABLE call_logs ADD COLUMN artifact_relpath TEXT");
      console.log("[DB] Added call_logs.artifact_relpath column");
    }
    if (!columnNames.has("has_pipeline_details")) {
      db2.exec("ALTER TABLE call_logs ADD COLUMN has_pipeline_details INTEGER DEFAULT 0");
      console.log("[DB] Added call_logs.has_pipeline_details column");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[DB] Failed to verify call_logs schema:", message);
  }
}
function getDbInstance() {
  const existing = getDb2();
  if (existing) return existing;
  if (isCloud || isBuildPhase) {
    if (isBuildPhase) {
      console.log("[DB] Build phase detected \u2014 using in-memory SQLite (read-only)");
    }
    const memoryDb = new Database(":memory:");
    memoryDb.pragma("journal_mode = WAL");
    memoryDb.exec(SCHEMA_SQL);
    ensureUsageHistoryColumns(memoryDb);
    setDb(memoryDb);
    return memoryDb;
  }
  const sqliteFile = SQLITE_FILE;
  if (!sqliteFile) {
    throw new Error("SQLITE_FILE is unavailable for local mode");
  }
  const jsonDbFile = JSON_DB_FILE;
  if (fs3.existsSync(sqliteFile)) {
    try {
      const probe = new Database(sqliteFile, { readonly: true });
      const hasOldSchema = probe
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get();
      if (hasOldSchema) {
        let hasData = false;
        try {
          const count = probe.prepare("SELECT COUNT(*) as c FROM provider_connections").get();
          hasData = Boolean(count && count.c > 0);
        } catch {}
        probe.close();
        if (hasData) {
          console.log(
            `[DB] Old schema_migrations table found but data exists \u2014 preserving data (#146)`
          );
          const fixDb = new Database(sqliteFile);
          try {
            fixDb.exec("DROP TABLE IF EXISTS schema_migrations");
            fixDb.pragma("wal_checkpoint(TRUNCATE)");
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn("[DB] Could not clean up old schema table:", message);
          } finally {
            fixDb.close();
          }
        } else {
          const oldPath = sqliteFile + ".old-schema";
          console.log(
            `[DB] Old incompatible schema detected (empty) \u2014 renaming to ${path3.basename(oldPath)}`
          );
          fs3.renameSync(sqliteFile, oldPath);
          for (const ext of ["-wal", "-shm"]) {
            try {
              if (fs3.existsSync(sqliteFile + ext)) fs3.unlinkSync(sqliteFile + ext);
            } catch {}
          }
        }
      } else {
        probe.close();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[DB] Could not probe existing DB, will create fresh:", message);
      try {
        fs3.unlinkSync(sqliteFile);
      } catch {}
    }
  }
  const db2 = new Database(sqliteFile);
  db2.pragma("journal_mode = WAL");
  db2.pragma("busy_timeout = 5000");
  db2.pragma("synchronous = NORMAL");
  db2.exec(SCHEMA_SQL);
  ensureProviderConnectionsColumns(db2);
  ensureUsageHistoryColumns(db2);
  ensureCallLogsColumns(db2);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS _omniroute_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO _omniroute_migrations (version, name)
    VALUES ('001', 'initial_schema');
  `);
  runMigrations(db2);
  if (jsonDbFile && fs3.existsSync(jsonDbFile)) {
    migrateFromJson(db2, jsonDbFile);
  }
  const versionStmt = db2.prepare(
    "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('schema_version', '1')"
  );
  versionStmt.run();
  setDb(db2);
  console.log(`[DB] SQLite database ready: ${sqliteFile}`);
  return db2;
}
function migrateFromJson(db2, jsonPath) {
  try {
    const raw = fs3.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(raw);
    const connCount = (data.providerConnections || []).length;
    const nodeCount = (data.providerNodes || []).length;
    const keyCount = (data.apiKeys || []).length;
    if (connCount === 0 && nodeCount === 0 && keyCount === 0) {
      console.log("[DB] db.json has no data to migrate, skipping");
      fs3.renameSync(jsonPath, jsonPath + ".empty");
      return;
    }
    console.log(
      `[DB] Migrating db.json \u2192 SQLite (${connCount} connections, ${nodeCount} nodes, ${keyCount} keys)...`
    );
    const migrate = db2.transaction(() => {
      const insertConn = db2.prepare(`
        INSERT OR REPLACE INTO provider_connections (
          id, provider, auth_type, name, email, priority, is_active,
          access_token, refresh_token, expires_at, token_expires_at,
          scope, project_id, test_status, error_code, last_error,
          last_error_at, last_error_type, last_error_source, backoff_level,
          rate_limited_until, health_check_interval, last_health_check_at,
          last_tested, api_key, id_token, provider_specific_data,
          expires_in, display_name, global_priority, default_model,
          token_type, consecutive_use_count, rate_limit_protection, last_used_at, created_at, updated_at
        ) VALUES (
          @id, @provider, @authType, @name, @email, @priority, @isActive,
          @accessToken, @refreshToken, @expiresAt, @tokenExpiresAt,
          @scope, @projectId, @testStatus, @errorCode, @lastError,
          @lastErrorAt, @lastErrorType, @lastErrorSource, @backoffLevel,
          @rateLimitedUntil, @healthCheckInterval, @lastHealthCheckAt,
          @lastTested, @apiKey, @idToken, @providerSpecificData,
          @expiresIn, @displayName, @globalPriority, @defaultModel,
          @tokenType, @consecutiveUseCount, @rateLimitProtection, @lastUsedAt, @createdAt, @updatedAt
        )
      `);
      for (const conn of data.providerConnections || []) {
        insertConn.run({
          id: conn.id,
          provider: conn.provider,
          authType: conn.authType || "oauth",
          name: conn.name || null,
          email: conn.email || null,
          priority: conn.priority || 0,
          isActive: conn.isActive === false ? 0 : 1,
          accessToken: conn.accessToken || null,
          refreshToken: conn.refreshToken || null,
          expiresAt: conn.expiresAt || null,
          tokenExpiresAt: conn.tokenExpiresAt || null,
          scope: conn.scope || null,
          projectId: conn.projectId || null,
          testStatus: conn.testStatus || null,
          errorCode: conn.errorCode || null,
          lastError: conn.lastError || null,
          lastErrorAt: conn.lastErrorAt || null,
          lastErrorType: conn.lastErrorType || null,
          lastErrorSource: conn.lastErrorSource || null,
          backoffLevel: conn.backoffLevel || 0,
          rateLimitedUntil: conn.rateLimitedUntil || null,
          healthCheckInterval: conn.healthCheckInterval || null,
          lastHealthCheckAt: conn.lastHealthCheckAt || null,
          lastTested: conn.lastTested || null,
          apiKey: conn.apiKey || null,
          idToken: conn.idToken || null,
          providerSpecificData: conn.providerSpecificData
            ? JSON.stringify(conn.providerSpecificData)
            : null,
          expiresIn: conn.expiresIn || null,
          displayName: conn.displayName || null,
          globalPriority: conn.globalPriority || null,
          defaultModel: conn.defaultModel || null,
          tokenType: conn.tokenType || null,
          consecutiveUseCount: conn.consecutiveUseCount || 0,
          lastUsedAt: conn.lastUsedAt || null,
          rateLimitProtection:
            conn.rateLimitProtection === true || conn.rateLimitProtection === 1 ? 1 : 0,
          createdAt: conn.createdAt || /* @__PURE__ */ new Date().toISOString(),
          updatedAt: conn.updatedAt || /* @__PURE__ */ new Date().toISOString(),
        });
      }
      const insertNode = db2.prepare(`
        INSERT OR REPLACE INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at)
        VALUES (@id, @type, @name, @prefix, @apiType, @baseUrl, @createdAt, @updatedAt)
      `);
      for (const node of data.providerNodes || []) {
        insertNode.run({
          id: node.id,
          type: node.type,
          name: node.name,
          prefix: node.prefix || null,
          apiType: node.apiType || null,
          baseUrl: node.baseUrl || null,
          createdAt: node.createdAt || /* @__PURE__ */ new Date().toISOString(),
          updatedAt: node.updatedAt || /* @__PURE__ */ new Date().toISOString(),
        });
      }
      const insertKv = db2.prepare(
        "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)"
      );
      for (const [alias, model] of Object.entries(data.modelAliases || {})) {
        insertKv.run("modelAliases", alias, JSON.stringify(model));
      }
      for (const [toolName, mappings] of Object.entries(data.mitmAlias || {})) {
        insertKv.run("mitmAlias", toolName, JSON.stringify(mappings));
      }
      for (const [key, value] of Object.entries(data.settings || {})) {
        insertKv.run("settings", key, JSON.stringify(value));
      }
      for (const [provider, models] of Object.entries(data.pricing || {})) {
        insertKv.run("pricing", provider, JSON.stringify(models));
      }
      for (const [providerId, models] of Object.entries(data.customModels || {})) {
        insertKv.run("customModels", providerId, JSON.stringify(models));
      }
      if (data.proxyConfig) {
        insertKv.run("proxyConfig", "global", JSON.stringify(data.proxyConfig.global || null));
        insertKv.run("proxyConfig", "providers", JSON.stringify(data.proxyConfig.providers || {}));
        insertKv.run("proxyConfig", "combos", JSON.stringify(data.proxyConfig.combos || {}));
        insertKv.run("proxyConfig", "keys", JSON.stringify(data.proxyConfig.keys || {}));
      }
      const insertCombo = db2.prepare(`
        INSERT OR REPLACE INTO combos (id, name, data, created_at, updated_at)
        VALUES (@id, @name, @data, @createdAt, @updatedAt)
      `);
      for (const combo of data.combos || []) {
        insertCombo.run({
          id: combo.id,
          name: combo.name,
          data: JSON.stringify(combo),
          createdAt: combo.createdAt || /* @__PURE__ */ new Date().toISOString(),
          updatedAt: combo.updatedAt || /* @__PURE__ */ new Date().toISOString(),
        });
      }
      const insertKey = db2.prepare(`
        INSERT OR REPLACE INTO api_keys (id, name, key, machine_id, allowed_models, no_log, created_at)
        VALUES (@id, @name, @key, @machineId, @allowedModels, @noLog, @createdAt)
      `);
      for (const apiKey of data.apiKeys || []) {
        insertKey.run({
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.key,
          machineId: apiKey.machineId || null,
          allowedModels: JSON.stringify(apiKey.allowedModels || []),
          noLog: apiKey.noLog ? 1 : 0,
          createdAt: apiKey.createdAt || /* @__PURE__ */ new Date().toISOString(),
        });
      }
    });
    migrate();
    const migratedPath = jsonPath + ".migrated";
    fs3.renameSync(jsonPath, migratedPath);
    console.log(`[DB] \u2713 Migration complete. Original saved as ${migratedPath}`);
    const legacyBackupDir = path3.join(DATA_DIR, "db_backups");
    if (fs3.existsSync(legacyBackupDir)) {
      const jsonBackups = fs3.readdirSync(legacyBackupDir).filter((f) => f.endsWith(".json"));
      if (jsonBackups.length > 0) {
        console.log(
          `[DB] Note: ${jsonBackups.length} legacy .json backups remain in ${legacyBackupDir}`
        );
      }
    }
  } catch (err) {
    console.error("[DB] Migration from db.json failed:", err.message);
  }
}

// src/lib/memory/schemas.ts
import { z as z2 } from "zod";

// src/lib/memory/types.ts
var MemoryType = /* @__PURE__ */ ((MemoryType2) => {
  MemoryType2["FACTUAL"] = "factual";
  MemoryType2["EPISODIC"] = "episodic";
  MemoryType2["PROCEDURAL"] = "procedural";
  MemoryType2["SEMANTIC"] = "semantic";
  return MemoryType2;
})(MemoryType || {});

// src/lib/memory/schemas.ts
var MemoryConfigSchema = z2.object({
  enabled: z2.boolean(),
  maxTokens: z2.number().int().positive(),
  retrievalStrategy: z2.enum(["exact", "semantic", "hybrid"]).optional(),
  autoSummarize: z2.boolean(),
  persistAcrossModels: z2.boolean(),
  retentionDays: z2.number().int().positive(),
  scope: z2.enum(["session", "apiKey", "global"]).optional(),
});
var MemoryCreateInputSchema = z2
  .object({
    type: z2.nativeEnum(MemoryType),
    key: z2.string().min(1),
    content: z2.string().min(1),
    metadata: z2.record(z2.string(), z2.unknown()).optional(),
  })
  .strict();
var MemoryUpdateInputSchema = z2
  .object({
    type: z2.nativeEnum(MemoryType).optional(),
    key: z2.string().min(1).optional(),
    content: z2.string().min(1).optional(),
    metadata: z2.record(z2.string(), z2.unknown()).optional(),
  })
  .strict();

// src/lib/memory/retrieval.ts
function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / 4);
}
async function retrieveMemories(apiKeyId, config = {}) {
  const normalizedConfig = MemoryConfigSchema.parse({
    enabled: true,
    maxTokens: 2e3,
    retrievalStrategy: "recent",
    autoSummarize: false,
    persistAcrossModels: false,
    retentionDays: 30,
    scope: "apiKey",
    ...config,
  });
  const maxTokens = Math.min(Math.max(normalizedConfig.maxTokens, 100), 8e3);
  const strategy = normalizedConfig.retrievalStrategy;
  const db2 = getDbInstance();
  const memories = [];
  let totalTokens = 0;
  let query = "SELECT * FROM memory WHERE apiKeyId = ?";
  const params = [apiKeyId];
  switch (strategy) {
    case "semantic":
      query += " ORDER BY createdAt DESC";
      break;
    case "hybrid":
      query += " ORDER BY createdAt DESC";
      break;
    case "exact":
    default:
      query += " ORDER BY createdAt DESC";
  }
  query += " LIMIT 100";
  const stmt = db2.prepare(query);
  const rows = stmt.all(...params);
  for (const row of rows) {
    const memory = {
      id: String(row.id),
      apiKeyId: String(row.apiKeyId),
      sessionId: String(row.sessionId),
      type: row.type,
      key: String(row.key),
      content: String(row.content),
      metadata: JSON.parse(String(row.metadata)),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
      expiresAt: row.expiresAt ? new Date(String(row.expiresAt)) : null,
    };
    const memoryTokens = estimateTokens(memory.content);
    if (totalTokens + memoryTokens > maxTokens) {
      if (memories.length === 0) {
        memories.push(memory);
        totalTokens += memoryTokens;
      }
      break;
    }
    memories.push(memory);
    totalTokens += memoryTokens;
  }
  return memories;
}

// src/lib/memory/store.ts
var MEMORY_MAX_CACHE_SIZE = 1e4;
var _memoryCache = /* @__PURE__ */ new Map();
function parseJSON(value) {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
function invalidateMemoryCache(key) {
  _memoryCache.delete(key);
}
function evictIfNeeded(cache) {
  if (cache.size > MEMORY_MAX_CACHE_SIZE) {
    const keysArray = Array.from(cache.keys());
    const entriesToRemove = Math.floor(cache.size * 0.2);
    for (let i = 0; i < entriesToRemove; i++) {
      cache.delete(keysArray[i]);
    }
  }
}
var MEMORY_VALIDATION_CACHE_TTL = 60 * 1e3;
async function createMemory(memory) {
  const db2 = getDbInstance();
  const id = crypto.randomUUID();
  const now = /* @__PURE__ */ new Date().toISOString();
  const stmt = db2.prepare(
    "INSERT INTO memory (id, apiKeyId, sessionId, type, key, content, metadata, createdAt, updatedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(
    id,
    memory.apiKeyId,
    memory.sessionId,
    memory.type,
    memory.key,
    memory.content,
    JSON.stringify(memory.metadata),
    now,
    now,
    memory.expiresAt?.toISOString() ?? null
  );
  const createdMemory = {
    id,
    apiKeyId: memory.apiKeyId,
    sessionId: memory.sessionId,
    type: memory.type,
    key: memory.key,
    content: memory.content,
    metadata: memory.metadata,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    expiresAt: memory.expiresAt ?? null,
  };
  invalidateMemoryCache(id);
  evictIfNeeded(_memoryCache);
  _memoryCache.set(id, { value: createdMemory, timestamp: Date.now() });
  return createdMemory;
}
async function deleteMemory(id) {
  if (!id || typeof id !== "string") return false;
  const db2 = getDbInstance();
  const stmt = db2.prepare("DELETE FROM memory WHERE id = ?");
  const result = stmt.run(id);
  if (result.changes === 0) {
    return false;
  }
  invalidateMemoryCache(id);
  return true;
}
async function listMemories(filters) {
  const db2 = getDbInstance();
  let query = "SELECT * FROM memory";
  const params = [];
  const whereClauses = [];
  if (filters.apiKeyId) {
    whereClauses.push("apiKeyId = ?");
    params.push(filters.apiKeyId);
  }
  if (filters.type) {
    whereClauses.push("type = ?");
    params.push(filters.type);
  }
  if (filters.sessionId) {
    whereClauses.push("sessionId = ?");
    params.push(filters.sessionId);
  }
  if (whereClauses.length > 0) {
    query += " WHERE " + whereClauses.join(" AND ");
  }
  query += " ORDER BY createdAt DESC";
  if (filters.limit !== void 0) {
    query += " LIMIT ?";
    params.push(filters.limit);
  }
  if (filters.offset !== void 0) {
    query += " OFFSET ?";
    params.push(filters.offset);
  }
  const stmt = db2.prepare(query);
  const rows = stmt.all(...params);
  return rows.map((row) => ({
    id: String(row.id),
    apiKeyId: String(row.apiKeyId),
    sessionId: String(row.sessionId),
    type: row.type,
    key: String(row.key),
    content: String(row.content),
    metadata: parseJSON(row.metadata),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    expiresAt: row.expiresAt ? new Date(String(row.expiresAt)) : null,
  }));
}

// open-sse/mcp-server/tools/memoryTools.ts
var MemorySearchSchema = z3.object({
  apiKeyId: z3.string(),
  query: z3.string().optional(),
  type: z3.enum(["factual", "episodic", "procedural", "semantic"]).optional(),
  maxTokens: z3.number().int().positive().max(8e3).optional(),
  limit: z3.number().int().positive().max(100).optional(),
});
var MemoryAddSchema = z3.object({
  apiKeyId: z3.string(),
  sessionId: z3.string().optional(),
  type: z3.enum(["factual", "episodic", "procedural", "semantic"]),
  key: z3.string().min(1),
  content: z3.string().min(1),
  metadata: z3.record(z3.string(), z3.unknown()).optional(),
});
var MemoryClearSchema = z3.object({
  apiKeyId: z3.string(),
  type: z3.enum(["factual", "episodic", "procedural", "semantic"]).optional(),
  olderThan: z3.string().optional(),
});
var memoryTools = {
  omniroute_memory_search: {
    name: "omniroute_memory_search",
    description: "Search memories by query, type, or API key with token budget enforcement",
    inputSchema: MemorySearchSchema,
    handler: async (args) => {
      const config = {
        enabled: true,
        maxTokens: args.maxTokens || 2e3,
        retrievalStrategy: "exact",
        autoSummarize: false,
        persistAcrossModels: false,
        retentionDays: 30,
        scope: "apiKey",
      };
      const memories = await retrieveMemories(args.apiKeyId, config);
      const filtered = args.type ? memories.filter((m) => m.type === args.type) : memories;
      const limited = args.limit ? filtered.slice(0, args.limit) : filtered;
      return {
        success: true,
        data: {
          memories: limited,
          count: limited.length,
          totalTokens: limited.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
        },
      };
    },
  },
  omniroute_memory_add: {
    name: "omniroute_memory_add",
    description: "Add a new memory entry",
    inputSchema: MemoryAddSchema,
    handler: async (args) => {
      const memory = await createMemory({
        apiKeyId: args.apiKeyId,
        sessionId: args.sessionId || "",
        type: args.type,
        key: args.key,
        content: args.content,
        metadata: args.metadata || {},
        expiresAt: null,
      });
      return {
        success: true,
        data: {
          memory,
          message: "Memory created successfully",
        },
      };
    },
  },
  omniroute_memory_clear: {
    name: "omniroute_memory_clear",
    description: "Clear memories for an API key, optionally filtered by type or age",
    inputSchema: MemoryClearSchema,
    handler: async (args) => {
      const memories = await listMemories({
        apiKeyId: args.apiKeyId,
        type: args.type,
      });
      let toDelete = memories;
      if (args.olderThan) {
        const cutoff = new Date(args.olderThan);
        toDelete = memories.filter((m) => new Date(m.createdAt) < cutoff);
      }
      let deletedCount = 0;
      for (const memory of toDelete) {
        await deleteMemory(memory.id);
        deletedCount++;
      }
      return {
        success: true,
        data: {
          deletedCount,
          message: `Cleared ${deletedCount} memories`,
        },
      };
    },
  },
};

// open-sse/mcp-server/tools/skillTools.ts
import { z as z5 } from "zod";

// src/lib/skills/schemas.ts
import { z as z4 } from "zod";

// src/lib/skills/types.ts
var SkillMode = /* @__PURE__ */ ((SkillMode2) => {
  SkillMode2["AUTO"] = "auto";
  SkillMode2["MANUAL"] = "manual";
  SkillMode2["HYBRID"] = "hybrid";
  return SkillMode2;
})(SkillMode || {});

// src/lib/skills/schemas.ts
var SkillSchema = z4.object({
  input: z4.record(z4.string(), z4.unknown()),
  output: z4.record(z4.string(), z4.unknown()),
});
var SkillCreateInputSchema = z4
  .object({
    name: z4.string().min(1).max(100),
    version: z4
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .default("1.0.0"),
    description: z4.string().max(500).optional(),
    schema: SkillSchema,
    handler: z4.string().min(1),
    enabled: z4.boolean().default(true),
  })
  .strict();
var SkillUpdateInputSchema = z4
  .object({
    name: z4.string().min(1).max(100).optional(),
    version: z4
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
    description: z4.string().max(500).optional(),
    schema: SkillSchema.optional(),
    handler: z4.string().min(1).optional(),
    enabled: z4.boolean().optional(),
  })
  .strict();
var SkillConfigSchema = z4.object({
  enabled: z4.boolean(),
  mode: z4.nativeEnum(SkillMode),
  allowedSkills: z4.array(z4.string()),
  timeout: z4.number().int().positive().default(3e4),
  maxRetries: z4.number().int().min(0).default(3),
});

// src/lib/skills/registry.ts
import { randomUUID } from "crypto";
var SkillRegistry = class _SkillRegistry {
  static instance;
  registeredSkills = /* @__PURE__ */ new Map();
  versionCache = /* @__PURE__ */ new Map();
  constructor() {}
  static getInstance() {
    if (!_SkillRegistry.instance) {
      _SkillRegistry.instance = new _SkillRegistry();
    }
    return _SkillRegistry.instance;
  }
  async register(skillData) {
    const parsed = SkillCreateInputSchema.parse(skillData);
    const db2 = getDbInstance();
    const id = randomUUID();
    const now = /* @__PURE__ */ new Date();
    db2
      .prepare(
        `INSERT INTO skills (id, api_key_id, name, version, description, schema, handler, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        skillData.apiKeyId,
        parsed.name,
        parsed.version,
        parsed.description || null,
        JSON.stringify(parsed.schema),
        parsed.handler,
        parsed.enabled ? 1 : 0,
        now.toISOString(),
        now.toISOString()
      );
    const skill = {
      id,
      apiKeyId: skillData.apiKeyId,
      name: parsed.name,
      version: parsed.version,
      description: parsed.description || "",
      schema: parsed.schema,
      handler: parsed.handler,
      enabled: parsed.enabled,
      createdAt: now,
      updatedAt: now,
    };
    this.registeredSkills.set(`${parsed.name}@${parsed.version}`, skill);
    this.updateVersionCache(skill);
    return skill;
  }
  async unregister(name, version, apiKeyId) {
    const db2 = getDbInstance();
    if (version) {
      const key = `${name}@${version}`;
      const skill = this.registeredSkills.get(key);
      if (skill && (!apiKeyId || skill.apiKeyId === apiKeyId)) {
        db2.prepare("DELETE FROM skills WHERE id = ?").run(skill.id);
        this.registeredSkills.delete(key);
        this.clearVersionCache(name);
        return true;
      }
    } else {
      const deleted = db2
        .prepare("DELETE FROM skills WHERE name = ? AND (? IS NULL OR api_key_id = ?)")
        .run(name, apiKeyId || null, apiKeyId || null);
      if (deleted.changes > 0) {
        const keysToDelete = Array.from(this.registeredSkills.keys()).filter((k) =>
          k.startsWith(`${name}@`)
        );
        keysToDelete.forEach((k) => this.registeredSkills.delete(k));
        this.clearVersionCache(name);
        return true;
      }
    }
    return false;
  }
  list(apiKeyId) {
    if (apiKeyId) {
      return Array.from(this.registeredSkills.values()).filter((s) => s.apiKeyId === apiKeyId);
    }
    return Array.from(this.registeredSkills.values());
  }
  getSkill(name, apiKeyId) {
    return this.registeredSkills.get(name);
  }
  getSkillVersions(name) {
    const cached = this.versionCache.get(name);
    if (!cached) return [];
    return Array.from(cached.values()).sort((a, b) => this.compareVersions(b.version, a.version));
  }
  resolveVersion(name, constraint, apiKeyId) {
    const versions = this.getSkillVersions(name);
    if (versions.length === 0) return void 0;
    const operator = constraint.charAt(0);
    const version = constraint.slice(1);
    switch (operator) {
      case "^":
        return versions.find((s) => this.satisfies(s.version, version, "^"));
      case "~":
        return versions.find((s) => this.satisfies(s.version, version, "~"));
      case ">":
      case ">=":
      case "<":
      case "<=":
      case "==":
        return versions.find((s) => this.satisfies(s.version, version, operator));
      default:
        return versions.find((s) => s.version === constraint);
    }
  }
  satisfies(version, base, operator) {
    const [baseMajor, baseMinor, basePatch] = base.split(".").map(Number);
    const [verMajor, verMinor, verPatch] = version.split(".").map(Number);
    switch (operator) {
      case "^":
        return (
          verMajor === baseMajor &&
          (verMinor > baseMinor || (verMinor === baseMinor && verPatch >= basePatch))
        );
      case "~":
        return verMajor === baseMajor && verMinor === baseMinor && verPatch >= basePatch;
      case ">":
        return this.compareVersions(version, base) > 0;
      case ">=":
        return this.compareVersions(version, base) >= 0;
      case "<":
        return this.compareVersions(version, base) < 0;
      case "<=":
        return this.compareVersions(version, base) <= 0;
      case "==":
        return version === base;
      default:
        return version === base;
    }
  }
  compareVersions(a, b) {
    const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    return aPatch - bPatch;
  }
  updateVersionCache(skill) {
    if (!this.versionCache.has(skill.name)) {
      this.versionCache.set(skill.name, /* @__PURE__ */ new Map());
    }
    this.versionCache.get(skill.name).set(skill.version, skill);
  }
  clearVersionCache(name) {
    this.versionCache.delete(name);
  }
  async loadFromDatabase(apiKeyId) {
    const db2 = getDbInstance();
    const rows = apiKeyId
      ? db2.prepare("SELECT * FROM skills WHERE api_key_id = ?").all(apiKeyId)
      : db2.prepare("SELECT * FROM skills").all();
    for (const row of rows) {
      const skill = {
        id: row.id,
        apiKeyId: row.api_key_id,
        name: row.name,
        version: row.version,
        description: row.description || "",
        schema: JSON.parse(row.schema),
        handler: row.handler,
        enabled: row.enabled === 1,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
      this.registeredSkills.set(`${skill.name}@${skill.version}`, skill);
      this.updateVersionCache(skill);
    }
  }
};
var skillRegistry = SkillRegistry.getInstance();

// src/lib/skills/executor.ts
import { randomUUID as randomUUID2 } from "crypto";
var SkillExecutor = class _SkillExecutor {
  static instance;
  handlers = /* @__PURE__ */ new Map();
  timeout = 3e4;
  maxRetries = 3;
  constructor() {}
  static getInstance() {
    if (!_SkillExecutor.instance) {
      _SkillExecutor.instance = new _SkillExecutor();
    }
    return _SkillExecutor.instance;
  }
  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }
  setTimeout(ms) {
    this.timeout = ms;
  }
  setMaxRetries(count) {
    this.maxRetries = count;
  }
  async execute(skillName, input, context) {
    const skill = skillRegistry.getSkill(skillName, context.apiKeyId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    if (!skill.enabled) {
      throw new Error(`Skill is disabled: ${skillName}`);
    }
    const db2 = getDbInstance();
    const executionId = randomUUID2();
    const startTime = Date.now();
    try {
      db2
        .prepare(
          `INSERT INTO skill_executions (id, skill_id, api_key_id, session_id, input, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          executionId,
          skill.id,
          context.apiKeyId,
          context.sessionId || null,
          JSON.stringify(input),
          "running" /* RUNNING */,
          /* @__PURE__ */ new Date().toISOString()
        );
      const handler = this.handlers.get(skill.handler);
      if (!handler) {
        throw new Error(`Handler not found: ${skill.handler}`);
      }
      let output = null;
      let errorMessage = null;
      let status = "success"; /* SUCCESS */
      try {
        const result = await this.executeWithTimeout(
          handler(input, { apiKeyId: context.apiKeyId, sessionId: context.sessionId || "" })
        );
        output = result;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        status = "error" /* ERROR */;
      }
      const durationMs = Date.now() - startTime;
      db2
        .prepare(
          `UPDATE skill_executions SET output = ?, status = ?, error_message = ?, duration_ms = ? WHERE id = ?`
        )
        .run(output ? JSON.stringify(output) : null, status, errorMessage, durationMs, executionId);
      return {
        id: executionId,
        skillId: skill.id,
        apiKeyId: context.apiKeyId,
        sessionId: context.sessionId || "",
        input,
        output,
        status,
        errorMessage,
        durationMs,
        createdAt: /* @__PURE__ */ new Date(),
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      db2
        .prepare(
          `UPDATE skill_executions SET status = ?, error_message = ?, duration_ms = ? WHERE id = ?`
        )
        .run("error" /* ERROR */, errorMessage, durationMs, executionId);
      throw err;
    }
  }
  async executeWithTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Skill execution timed out")), this.timeout)
      ),
    ]);
  }
  getExecution(executionId) {
    const db2 = getDbInstance();
    const row = db2.prepare("SELECT * FROM skill_executions WHERE id = ?").get(executionId);
    if (!row) return void 0;
    return {
      id: row.id,
      skillId: row.skill_id,
      apiKeyId: row.api_key_id,
      sessionId: row.session_id || "",
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : null,
      status: row.status,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    };
  }
  listExecutions(apiKeyId, limit = 50) {
    const db2 = getDbInstance();
    const rows = apiKeyId
      ? db2
          .prepare(
            "SELECT * FROM skill_executions WHERE api_key_id = ? ORDER BY created_at DESC LIMIT ?"
          )
          .all(apiKeyId, limit)
      : db2.prepare("SELECT * FROM skill_executions ORDER BY created_at DESC LIMIT ?").all(limit);
    return rows.map((row) => ({
      id: row.id,
      skillId: row.skill_id,
      apiKeyId: row.api_key_id,
      sessionId: row.session_id || "",
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : null,
      status: row.status,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    }));
  }
};
var skillExecutor = SkillExecutor.getInstance();

// open-sse/mcp-server/tools/skillTools.ts
var SkillListSchema = z5.object({
  apiKeyId: z5.string().optional(),
  name: z5.string().optional(),
  enabled: z5.boolean().optional(),
});
var SkillEnableSchema = z5.object({
  apiKeyId: z5.string(),
  skillId: z5.string(),
  enabled: z5.boolean(),
});
var SkillExecuteSchema = z5.object({
  apiKeyId: z5.string(),
  skillName: z5.string(),
  input: z5.record(z5.string(), z5.unknown()),
  sessionId: z5.string().optional(),
});
var skillTools = {
  omniroute_skills_list: {
    name: "omniroute_skills_list",
    description: "List all registered skills with optional filtering by API key or name",
    inputSchema: SkillListSchema,
    handler: async (args) => {
      await skillRegistry.loadFromDatabase(args.apiKeyId);
      const skills = skillRegistry.list(args.apiKeyId);
      let filtered = skills;
      if (args.name) {
        filtered = filtered.filter((s) => s.name.includes(args.name));
      }
      if (args.enabled !== void 0) {
        filtered = filtered.filter((s) => s.enabled === args.enabled);
      }
      return {
        skills: filtered.map((s) => ({
          id: s.id,
          name: s.name,
          version: s.version,
          description: s.description,
          enabled: s.enabled,
          createdAt: s.createdAt.toISOString(),
        })),
        count: filtered.length,
      };
    },
  },
  omniroute_skills_enable: {
    name: "omniroute_skills_enable",
    description: "Enable or disable a specific skill by ID",
    inputSchema: SkillEnableSchema,
    handler: async (args) => {
      const skill = skillRegistry.getSkill(args.skillId, args.apiKeyId);
      if (!skill) {
        throw new Error(`Skill not found: ${args.skillId}`);
      }
      await skillRegistry.register({
        ...skill,
        enabled: args.enabled,
        apiKeyId: args.apiKeyId,
      });
      return { success: true, skillId: args.skillId, enabled: args.enabled };
    },
  },
  omniroute_skills_execute: {
    name: "omniroute_skills_execute",
    description: "Execute a skill with provided input and return the result",
    inputSchema: SkillExecuteSchema,
    handler: async (args) => {
      const execution = await skillExecutor.execute(args.skillName, args.input, {
        apiKeyId: args.apiKeyId,
        sessionId: args.sessionId,
      });
      return {
        id: execution.id,
        skillId: execution.skillId,
        status: execution.status,
        output: execution.output,
        error: execution.errorMessage,
        duration: execution.durationMs,
        createdAt: execution.createdAt.toISOString(),
      };
    },
  },
  omniroute_skills_executions: {
    name: "omniroute_skills_executions",
    description: "List recent skill execution history",
    inputSchema: z5.object({
      apiKeyId: z5.string().optional(),
      limit: z5.number().int().positive().max(100).optional(),
    }),
    handler: async (args) => {
      const executions = skillExecutor.listExecutions(args.apiKeyId, args.limit || 50);
      return {
        executions: executions.map((e) => ({
          id: e.id,
          skillId: e.skillId,
          status: e.status,
          duration: e.durationMs,
          error: e.errorMessage,
          createdAt: e.createdAt.toISOString(),
        })),
        count: executions.length,
      };
    },
  },
};

// open-sse/mcp-server/server.ts
var OMNIROUTE_BASE_URL2 = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128";
var OMNIROUTE_API_KEY2 = process.env.OMNIROUTE_API_KEY || "";
var MCP_ENFORCE_SCOPES = process.env.OMNIROUTE_MCP_ENFORCE_SCOPES === "true";
var MCP_ALLOWED_SCOPES = new Set(
  (process.env.OMNIROUTE_MCP_SCOPES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
function toRecord2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toArray(value) {
  return Array.isArray(value) ? value : [];
}
function toString2(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function toNumber3(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function toStringArray(value, fallback = []) {
  const values = toArray(value).filter((entry) => typeof entry === "string");
  return values.length > 0 ? values : fallback;
}
function normalizeComboModels(rawModels) {
  return toArray(rawModels).map((rawModel, index) => {
    const model = toRecord2(rawModel);
    return {
      provider: toString2(model.provider, "unknown"),
      model: toString2(model.model, "unknown"),
      priority: toNumber3(model.priority, index + 1),
    };
  });
}
async function omniRouteFetch(path4, options = {}) {
  const url = `${OMNIROUTE_BASE_URL2}${path4}`;
  const headers = {
    "Content-Type": "application/json",
    ...(OMNIROUTE_API_KEY2 ? { Authorization: `Bearer ${OMNIROUTE_API_KEY2}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(1e4) });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`OmniRoute API error [${response.status}]: ${errorText}`);
  }
  return response.json();
}
function withScopeEnforcement(toolName, handler) {
  return async (args, extra) => {
    const scopeContext = resolveCallerScopeContext(extra, Array.from(MCP_ALLOWED_SCOPES));
    const scopeCheck = evaluateToolScopes(toolName, scopeContext.scopes, MCP_ENFORCE_SCOPES);
    if (!scopeCheck.allowed) {
      const missingScopes =
        scopeCheck.missing.length > 0 ? scopeCheck.missing.join(", ") : "unavailable";
      const reason = scopeCheck.reason || "scope_check_failed";
      const msg = `Insufficient MCP scopes for ${toolName}. Missing: ${missingScopes}. Caller=${scopeContext.callerId}, source=${scopeContext.source}.`;
      const safeArgs = args && typeof args === "object" ? toRecord2(args) : { rawArgs: args };
      await logToolCall(
        toolName,
        {
          ...safeArgs,
          _scopeCheck: {
            callerId: scopeContext.callerId,
            source: scopeContext.source,
            required: scopeCheck.required,
            provided: scopeCheck.provided,
            missing: scopeCheck.missing,
          },
        },
        null,
        0,
        false,
        `scope_denied:${reason}`
      );
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
    return handler(args, extra);
  };
}
async function handleGetHealth() {
  const start = Date.now();
  try {
    const [healthRaw, resilienceRaw, rateLimitsRaw] = await Promise.allSettled([
      omniRouteFetch("/api/monitoring/health"),
      omniRouteFetch("/api/resilience"),
      omniRouteFetch("/api/rate-limits"),
    ]);
    const health = healthRaw.status === "fulfilled" ? toRecord2(healthRaw.value) : {};
    const resilience = resilienceRaw.status === "fulfilled" ? toRecord2(resilienceRaw.value) : {};
    const rateLimits = rateLimitsRaw.status === "fulfilled" ? toRecord2(rateLimitsRaw.value) : {};
    const memoryUsageRaw = toRecord2(health.memoryUsage);
    const cacheStatsRaw = toRecord2(health.cacheStats);
    const resilienceCircuitBreakers = toArray(resilience.circuitBreakers);
    const rateLimitEntries = toArray(rateLimits.limits);
    const result = {
      uptime: toString2(health.uptime, "unknown"),
      version: toString2(health.version, "unknown"),
      memoryUsage: {
        heapUsed: toNumber3(memoryUsageRaw.heapUsed, 0),
        heapTotal: toNumber3(memoryUsageRaw.heapTotal, 0),
      },
      circuitBreakers: resilienceCircuitBreakers,
      rateLimits: rateLimitEntries,
      cacheStats:
        Object.keys(cacheStatsRaw).length > 0
          ? {
              hits: toNumber3(cacheStatsRaw.hits, 0),
              misses: toNumber3(cacheStatsRaw.misses, 0),
              hitRate: toNumber3(cacheStatsRaw.hitRate, 0),
            }
          : void 0,
    };
    await logToolCall("omniroute_get_health", {}, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_health", {}, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleListCombos(args) {
  const start = Date.now();
  try {
    const combosRaw = await omniRouteFetch("/api/combos");
    const combosRecord = toRecord2(combosRaw);
    const combos = Array.isArray(combosRecord.combos)
      ? combosRecord.combos
      : Array.isArray(combosRaw)
        ? combosRaw
        : [];
    let metrics = {};
    if (args.includeMetrics) {
      metrics = toRecord2(await omniRouteFetch("/api/combos/metrics").catch(() => ({})));
    }
    const result = {
      combos: toArray(combos).map((rawCombo) => {
        const combo = toRecord2(rawCombo);
        const comboData = toRecord2(combo.data);
        const comboId = toString2(combo.id, "");
        const modelsSource =
          Array.isArray(combo.models) && combo.models.length > 0 ? combo.models : comboData.models;
        return {
          id: comboId,
          name: toString2(combo.name, comboId || "unnamed"),
          models: normalizeComboModels(modelsSource),
          strategy: toString2(combo.strategy, toString2(comboData.strategy, "priority")),
          enabled: combo.enabled !== false,
          ...(args.includeMetrics ? { metrics: metrics[comboId] ?? null } : {}),
        };
      }),
    };
    await logToolCall("omniroute_list_combos", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_list_combos", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleGetComboMetrics(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch(
      `/api/combos/metrics?comboId=${encodeURIComponent(args.comboId)}`
    );
    await logToolCall("omniroute_get_combo_metrics", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_get_combo_metrics", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleSwitchCombo(args) {
  const start = Date.now();
  try {
    const result = await omniRouteFetch(`/api/combos/${encodeURIComponent(args.comboId)}`, {
      method: "PUT",
      body: JSON.stringify({ isActive: args.active }),
    });
    await logToolCall("omniroute_switch_combo", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_switch_combo", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleCheckQuota(args) {
  const start = Date.now();
  try {
    let path4 = "/api/usage/quota";
    if (args.connectionId) path4 += `?connectionId=${encodeURIComponent(args.connectionId)}`;
    else if (args.provider) path4 += `?provider=${encodeURIComponent(args.provider)}`;
    const result = normalizeQuotaResponse(await omniRouteFetch(path4), {
      provider: args.provider || null,
      connectionId: args.connectionId || null,
    });
    await logToolCall("omniroute_check_quota", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_check_quota", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleRouteRequest(args) {
  const start = Date.now();
  try {
    const body = {
      model: args.model,
      messages: args.messages,
      stream: false,
      // MCP tool always returns non-streaming
    };
    if (args.combo) {
      body["x-combo"] = args.combo;
    }
    const raw = await omniRouteFetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const choices = toArray(raw.choices);
    const firstChoice = toRecord2(choices[0]);
    const firstMessage = toRecord2(firstChoice.message);
    const usage = toRecord2(raw.usage);
    const result = {
      response: {
        content: toString2(firstMessage.content, ""),
        model: toString2(raw.model, args.model),
        tokens: {
          prompt: toNumber3(usage.prompt_tokens, 0),
          completion: toNumber3(usage.completion_tokens, 0),
        },
      },
      routing: {
        provider: toString2(raw.provider, "unknown"),
        combo: raw.combo ?? null,
        fallbacksTriggered: toNumber3(raw.fallbacksTriggered, 0),
        cost: toNumber3(raw.cost, 0),
        latencyMs: Date.now() - start,
        routingExplanation: toString2(
          raw.routingExplanation,
          "Request routed through primary provider"
        ),
      },
    };
    await logToolCall(
      "omniroute_route_request",
      { model: args.model, messageCount: args.messages.length },
      result.routing,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall(
      "omniroute_route_request",
      { model: args.model },
      null,
      Date.now() - start,
      false,
      msg
    );
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleCostReport(args) {
  const start = Date.now();
  try {
    const period = args.period || "session";
    const rangeMap = {
      session: "1d",
      day: "1d",
      week: "7d",
      month: "30d",
    };
    const range = rangeMap[period] || "30d";
    const raw = toRecord2(
      await omniRouteFetch(`/api/usage/analytics?range=${encodeURIComponent(range)}`)
    );
    const tokenCount = toRecord2(raw.tokenCount);
    const budget = toRecord2(raw.budget);
    const result = {
      period,
      totalCost: toNumber3(raw.totalCost, 0),
      requestCount: toNumber3(raw.requestCount, 0),
      tokenCount: {
        prompt: toNumber3(tokenCount.prompt, 0),
        completion: toNumber3(tokenCount.completion, 0),
      },
      byProvider: toArray(raw.byProvider),
      byModel: toArray(raw.byModel),
      budget: {
        limit: budget.limit ?? null,
        remaining: budget.remaining ?? null,
      },
    };
    await logToolCall("omniroute_cost_report", args, result, Date.now() - start, true);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_cost_report", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
async function handleListModelsCatalog(args) {
  const start = Date.now();
  try {
    let path4 = "/v1/models";
    let isProviderSpecific = false;
    let source = "local_catalog";
    let warning;
    if (args.provider && !args.capability) {
      path4 = `/api/providers/${encodeURIComponent(args.provider)}/models?excludeHidden=true`;
      isProviderSpecific = true;
    } else {
      const params = new URLSearchParams();
      if (args.provider) params.set("provider", args.provider);
      if (args.capability) params.set("capability", args.capability);
      if (params.toString()) path4 += `?${params.toString()}`;
    }
    const raw = toRecord2(await omniRouteFetch(path4));
    let rawModels = [];
    if (isProviderSpecific) {
      rawModels = Array.isArray(raw.models) ? raw.models : [];
      source = typeof raw.source === "string" ? raw.source : "api";
      if (raw.warning) warning = String(raw.warning);
    } else {
      rawModels = Array.isArray(raw.data) ? raw.data : [];
      source = "local_catalog";
    }
    const result = {
      models: rawModels.map((rawModel) => {
        const model = toRecord2(rawModel);
        return {
          id: toString2(model.id, ""),
          provider: toString2(
            model.owned_by,
            toString2(model.provider, args.provider || "unknown")
          ),
          capabilities: toStringArray(model.capabilities, ["chat"]),
          status: toString2(model.status, "available"),
          pricing: model.pricing,
        };
      }),
      source,
      ...(warning ? { warning } : {}),
    };
    await logToolCall(
      "omniroute_list_models_catalog",
      args,
      { modelCount: result.models.length },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("omniroute_list_models_catalog", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}
function createMcpServer() {
  const server = new McpServer({
    name: "omniroute",
    version: process.env.npm_package_version || "1.8.1",
  });
  server.registerTool(
    "omniroute_get_health",
    {
      description:
        "Returns OmniRoute health status including uptime, memory, circuit breakers, rate limits, and cache stats",
      inputSchema: getHealthInput,
    },
    withScopeEnforcement("omniroute_get_health", async (args) => {
      getHealthInput.parse(args ?? {});
      return handleGetHealth();
    })
  );
  server.registerTool(
    "omniroute_list_combos",
    {
      description:
        "Lists all configured combos (model chains) with strategies and optional metrics",
      inputSchema: listCombosInput,
    },
    withScopeEnforcement("omniroute_list_combos", (args) =>
      handleListCombos(listCombosInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_combo_metrics",
    {
      description: "Returns detailed performance metrics for a specific combo",
      inputSchema: getComboMetricsInput,
    },
    withScopeEnforcement("omniroute_get_combo_metrics", (args) =>
      handleGetComboMetrics(getComboMetricsInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_switch_combo",
    {
      description: "Activates or deactivates a combo for routing",
      inputSchema: switchComboInput,
    },
    withScopeEnforcement("omniroute_switch_combo", (args) =>
      handleSwitchCombo(switchComboInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_check_quota",
    {
      description: "Checks remaining API quota for one or all providers",
      inputSchema: checkQuotaInput,
    },
    withScopeEnforcement("omniroute_check_quota", (args) =>
      handleCheckQuota(checkQuotaInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_route_request",
    {
      description: "Sends a chat completion request through OmniRoute intelligent routing",
      inputSchema: routeRequestInput,
    },
    withScopeEnforcement("omniroute_route_request", (args) =>
      handleRouteRequest(routeRequestInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_cost_report",
    {
      description: "Generates a cost report for the specified period",
      inputSchema: costReportInput,
    },
    withScopeEnforcement("omniroute_cost_report", (args) =>
      handleCostReport(costReportInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_list_models_catalog",
    {
      description: "Lists all available AI models across providers with capabilities and pricing",
      inputSchema: listModelsCatalogInput,
    },
    withScopeEnforcement("omniroute_list_models_catalog", (args) =>
      handleListModelsCatalog(listModelsCatalogInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_simulate_route",
    {
      description: "Simulates the routing path a request would take without executing it (dry-run)",
      inputSchema: simulateRouteInput,
    },
    withScopeEnforcement("omniroute_simulate_route", (args) =>
      handleSimulateRoute(simulateRouteInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_budget_guard",
    {
      description:
        "Sets a session budget limit with configurable action when exceeded (degrade/block/alert)",
      inputSchema: setBudgetGuardInput,
    },
    withScopeEnforcement("omniroute_set_budget_guard", (args) =>
      handleSetBudgetGuard(setBudgetGuardInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_routing_strategy",
    {
      description:
        "Updates combo routing strategy at runtime (priority/weighted/round-robin/auto/etc.)",
      inputSchema: setRoutingStrategyInput,
    },
    withScopeEnforcement("omniroute_set_routing_strategy", (args) =>
      handleSetRoutingStrategy(setRoutingStrategyInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_set_resilience_profile",
    {
      description:
        "Applies a resilience profile controlling circuit breakers, retries, timeouts, and fallback depth",
      inputSchema: setResilienceProfileInput,
    },
    withScopeEnforcement("omniroute_set_resilience_profile", (args) =>
      handleSetResilienceProfile(setResilienceProfileInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_test_combo",
    {
      description:
        "Tests each provider in a combo with a real prompt, reporting latency, cost, and success per provider",
      inputSchema: testComboInput,
    },
    withScopeEnforcement("omniroute_test_combo", (args) =>
      handleTestCombo(testComboInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_provider_metrics",
    {
      description:
        "Returns detailed metrics for a specific provider including latency percentiles and circuit breaker state",
      inputSchema: getProviderMetricsInput,
    },
    withScopeEnforcement("omniroute_get_provider_metrics", (args) =>
      handleGetProviderMetrics(getProviderMetricsInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_best_combo_for_task",
    {
      description:
        "Recommends the best combo for a task type based on provider fitness and constraints",
      inputSchema: bestComboForTaskInput,
    },
    withScopeEnforcement("omniroute_best_combo_for_task", (args) =>
      handleBestComboForTask(bestComboForTaskInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_explain_route",
    {
      description:
        "Explains why a request was routed to a specific provider, showing scoring factors and fallbacks",
      inputSchema: explainRouteInput,
    },
    withScopeEnforcement("omniroute_explain_route", (args) =>
      handleExplainRoute(explainRouteInput.parse(args))
    )
  );
  server.registerTool(
    "omniroute_get_session_snapshot",
    {
      description:
        "Returns a full snapshot of the current working session: cost, tokens, top models, errors, budget status",
      inputSchema: getSessionSnapshotInput,
    },
    withScopeEnforcement("omniroute_get_session_snapshot", async (args) => {
      getSessionSnapshotInput.parse(args ?? {});
      return handleGetSessionSnapshot();
    })
  );
  server.registerTool(
    "omniroute_sync_pricing",
    {
      description:
        "Syncs pricing data from external sources (LiteLLM) into OmniRoute without overwriting user-set prices",
      inputSchema: syncPricingInput,
    },
    withScopeEnforcement("omniroute_sync_pricing", (args) =>
      handleSyncPricing(syncPricingInput.parse(args))
    )
  );
  Object.values(memoryTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema,
      },
      withScopeEnforcement(toolDef.name, async (args) => {
        try {
          const parsedArgs = toolDef.inputSchema.parse(args ?? {});
          const result = await toolDef.handler(parsedArgs);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      })
    );
  });
  Object.values(skillTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema,
      },
      withScopeEnforcement(toolDef.name, async (args) => {
        try {
          const parsedArgs = toolDef.inputSchema.parse(args ?? {});
          const result = await toolDef.handler(parsedArgs);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      })
    );
  });
  return server;
}
async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  const version = process.env.npm_package_version || "1.8.1";
  const stopHeartbeat = startMcpHeartbeat({
    version,
    scopesEnforced: MCP_ENFORCE_SCOPES,
    allowedScopes: Array.from(MCP_ALLOWED_SCOPES),
    toolCount: MCP_TOOLS.length,
  });
  const stopHeartbeatOnce = () => {
    stopHeartbeat();
  };
  process.once("exit", stopHeartbeatOnce);
  process.once("SIGINT", stopHeartbeatOnce);
  process.once("SIGTERM", stopHeartbeatOnce);
  console.error("[MCP] OmniRoute MCP Server starting (stdio transport)...");
  try {
    await server.connect(transport);
    console.error("[MCP] OmniRoute MCP Server connected and ready.");
  } finally {
    stopHeartbeatOnce();
    process.off("exit", stopHeartbeatOnce);
    process.off("SIGINT", stopHeartbeatOnce);
    process.off("SIGTERM", stopHeartbeatOnce);
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  startMcpStdio().catch((err) => {
    console.error("[MCP] Fatal error:", err);
    process.exit(1);
  });
}
export { createMcpServer, startMcpStdio };
