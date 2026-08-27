import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getHealthInput,
  listCombosInput,
  getComboMetricsInput,
  switchComboInput,
  checkQuotaInput,
  routeRequestInput,
  costReportInput,
  listModelsCatalogInput,
  listFreeTiersInput,
  getCompressionInfoInput,
  webSearchInput,
  simulateRouteInput,
  setBudgetGuardInput,
  setRoutingStrategyInput,
  setResilienceProfileInput,
  testComboInput,
  getProviderMetricsInput,
  bestComboForTaskInput,
  getSessionSnapshotInput,
  syncPricingInput,
  cacheStatsInput,
  cacheFlushInput,
} from "../schemas/tools.ts";
import { logToolCall } from "../audit.ts";
import {
  evaluateToolScopes,
  resolveCallerScopeContext,
  type McpToolExtraLike,
} from "../scopeEnforcement.ts";
import {
  handleSimulateRoute,
  handleSetBudgetGuard,
  handleSetRoutingStrategy,
  handleSetResilienceProfile,
  handleTestCombo,
  handleGetProviderMetrics,
  handleBestComboForTask,
  handleSyncPricing,
  handleGetSessionSnapshot,
  handleCacheStats,
  handleCacheFlush,
} from "../tools/advancedTools.ts";
import { memoryTools } from "../tools/memoryTools.ts";
import {
  handleGetHealth,
  handleListCombos,
  handleGetComboMetrics,
  handleSwitchCombo,
  handleCheckQuota,
  handleRouteRequest,
  handleCostReport,
  handleListModelsCatalog,
  handleWebSearch,
  handleListFreeTiers,
  handleGetCompressionInfo,
} from "./essentialHandlers.ts";
import type { McpServerOptions, McpTransportKind, TextToolResult } from "./types.ts";
import { toRecord } from "./helpers.ts";
import { FULL_TOOL_SCOPES } from "./config.ts";

export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "routiform",
    version: process.env.npm_package_version || "1.8.1",
  });

  const transport: McpTransportKind = options.transport ?? "stdio";
  const enforceScopes =
    transport === "http"
      ? process.env.ROUTIFORM_MCP_ENFORCE_SCOPES !== "false"
      : process.env.ROUTIFORM_MCP_ENFORCE_SCOPES === "true";
  // stdio is a trusted-local transport, so its callers derive full tool scopes from the
  // registry itself. HTTP callers never receive this fallback — no authInfo means no scopes.
  const trustedScopes = transport === "stdio" ? FULL_TOOL_SCOPES : [];

  function withScopeEnforcement(
    toolName: string,
    handler: (args: unknown, extra?: McpToolExtraLike) => Promise<TextToolResult>
  ) {
    return async (args: unknown, extra?: McpToolExtraLike): Promise<TextToolResult> => {
      const effectiveExtra = options.authInfo
        ? { ...(extra ?? {}), authInfo: options.authInfo }
        : extra;
      const scopeContext = resolveCallerScopeContext(effectiveExtra, trustedScopes);
      const scopeCheck = evaluateToolScopes(toolName, scopeContext.scopes, enforceScopes);
      if (!scopeCheck.allowed) {
        const missingScopes =
          scopeCheck.missing.length > 0 ? scopeCheck.missing.join(", ") : "unavailable";
        const reason = scopeCheck.reason || "scope_check_failed";
        const msg =
          `Insufficient MCP scopes for ${toolName}. ` +
          `Missing: ${missingScopes}. ` +
          `Caller=${scopeContext.callerId}, source=${scopeContext.source}.`;
        const safeArgs = args && typeof args === "object" ? toRecord(args) : { rawArgs: args };
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
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }

      return handler(args, effectiveExtra);
    };
  }

  // Register essential tools
  server.registerTool(
    "routiform_get_health",
    {
      description:
        "Returns Routiform health status including uptime, memory, circuit breakers, rate limits, and cache stats",
      inputSchema: getHealthInput,
    },
    withScopeEnforcement("routiform_get_health", async (args) => {
      getHealthInput.parse(args ?? {});
      return handleGetHealth();
    })
  );

  server.registerTool(
    "routiform_list_combos",
    {
      description:
        "Lists all configured combos (model chains) with strategies and optional metrics",
      inputSchema: listCombosInput,
    },
    withScopeEnforcement("routiform_list_combos", (args) =>
      handleListCombos(listCombosInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_get_combo_metrics",
    {
      description: "Returns detailed performance metrics for a specific combo",
      inputSchema: getComboMetricsInput,
    },
    withScopeEnforcement("routiform_get_combo_metrics", (args) =>
      handleGetComboMetrics(getComboMetricsInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_switch_combo",
    {
      description: "Activates or deactivates a combo for routing",
      inputSchema: switchComboInput,
    },
    withScopeEnforcement("routiform_switch_combo", (args) =>
      handleSwitchCombo(switchComboInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_check_quota",
    {
      description: "Checks remaining API quota for one or all providers",
      inputSchema: checkQuotaInput,
    },
    withScopeEnforcement("routiform_check_quota", (args) =>
      handleCheckQuota(checkQuotaInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_route_request",
    {
      description: "Sends a chat completion request through Routiform intelligent routing",
      inputSchema: routeRequestInput,
    },
    withScopeEnforcement("routiform_route_request", (args) =>
      handleRouteRequest(routeRequestInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_cost_report",
    {
      description: "Generates a cost report for the specified period",
      inputSchema: costReportInput,
    },
    withScopeEnforcement("routiform_cost_report", (args) =>
      handleCostReport(costReportInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_list_models_catalog",
    {
      description: "Lists all available AI models across providers with capabilities and pricing",
      inputSchema: listModelsCatalogInput,
    },
    withScopeEnforcement("routiform_list_models_catalog", (args) =>
      handleListModelsCatalog(listModelsCatalogInput.parse(args))
    )
  );

  // ── Advanced Tools (Phase 3) ──────────────────────────────

  server.registerTool(
    "routiform_simulate_route",
    {
      description: "Simulates the routing path a request would take without executing it (dry-run)",
      inputSchema: simulateRouteInput,
    },
    withScopeEnforcement("routiform_simulate_route", (args) =>
      handleSimulateRoute(simulateRouteInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_set_budget_guard",
    {
      description:
        "Records a session budget limit and reports spend against it (report-only; it does not block or degrade requests). Action is informational: degrade/block/alert",
      inputSchema: setBudgetGuardInput,
    },
    withScopeEnforcement("routiform_set_budget_guard", (args) =>
      handleSetBudgetGuard(setBudgetGuardInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_set_routing_strategy",
    {
      description:
        "Updates combo routing strategy at runtime (priority/weighted/round-robin/auto/etc.)",
      inputSchema: setRoutingStrategyInput,
    },
    withScopeEnforcement("routiform_set_routing_strategy", (args) =>
      handleSetRoutingStrategy(setRoutingStrategyInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_set_resilience_profile",
    {
      description:
        "Applies a resilience profile controlling circuit breakers, retries, timeouts, and fallback depth",
      inputSchema: setResilienceProfileInput,
    },
    withScopeEnforcement("routiform_set_resilience_profile", (args) =>
      handleSetResilienceProfile(setResilienceProfileInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_test_combo",
    {
      description:
        "Tests each provider in a combo with a real prompt, reporting latency, cost, and success per provider",
      inputSchema: testComboInput,
    },
    withScopeEnforcement("routiform_test_combo", (args) =>
      handleTestCombo(testComboInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_get_provider_metrics",
    {
      description:
        "Returns detailed metrics for a specific provider including latency percentiles and circuit breaker state",
      inputSchema: getProviderMetricsInput,
    },
    withScopeEnforcement("routiform_get_provider_metrics", (args) =>
      handleGetProviderMetrics(getProviderMetricsInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_best_combo_for_task",
    {
      description:
        "Recommends the best combo for a task type based on provider fitness and constraints",
      inputSchema: bestComboForTaskInput,
    },
    withScopeEnforcement("routiform_best_combo_for_task", (args) =>
      handleBestComboForTask(bestComboForTaskInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_cache_stats",
    {
      description:
        "Returns cache statistics: semantic cache hit rate, prompt cache metrics by provider, and idempotency layer stats",
      inputSchema: cacheStatsInput,
    },
    withScopeEnforcement("routiform_cache_stats", (args) =>
      handleCacheStats(cacheStatsInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_cache_flush",
    {
      description: "Flush cache entries by signature, by model, or entirely when neither is given",
      inputSchema: cacheFlushInput,
    },
    withScopeEnforcement("routiform_cache_flush", (args) =>
      handleCacheFlush(cacheFlushInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_get_session_snapshot",
    {
      description:
        "Returns a full snapshot of the current working session: cost, tokens, top models, errors, budget status",
      inputSchema: getSessionSnapshotInput,
    },
    withScopeEnforcement("routiform_get_session_snapshot", async (args) => {
      getSessionSnapshotInput.parse(args ?? {});
      return handleGetSessionSnapshot();
    })
  );

  server.registerTool(
    "routiform_sync_pricing",
    {
      description:
        "Syncs pricing data from external sources (LiteLLM) into Routiform without overwriting user-set prices",
      inputSchema: syncPricingInput,
    },
    withScopeEnforcement("routiform_sync_pricing", (args) =>
      handleSyncPricing(syncPricingInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_web_search",
    {
      description:
        "Performs a web search using Routiform's search gateway. Supports multiple providers (Serper, Brave, Perplexity, Exa, Tavily) with automatic failover. Returns search results with titles, URLs, snippets, and position data.",
      inputSchema: webSearchInput,
    },
    withScopeEnforcement("routiform_web_search", (args) =>
      handleWebSearch(webSearchInput.parse(args))
    )
  );

  server.registerTool(
    "routiform_list_free_tiers",
    {
      description:
        "Lists documented free / freemium provider tiers in the Routiform catalog (static notes, not live remaining quota).",
      inputSchema: listFreeTiersInput,
    },
    withScopeEnforcement("routiform_list_free_tiers", (args) => handleListFreeTiers(args))
  );
  server.registerTool(
    "routiform_get_compression_info",
    {
      description:
        "Describes the registered compression engines, the presets that select them, and how compression is gated.",
      inputSchema: getCompressionInfoInput,
    },
    withScopeEnforcement("routiform_get_compression_info", (args) => handleGetCompressionInfo(args))
  );

  // ── Memory Tools ──────────────────────────────
  Object.values(memoryTools).forEach((toolDef) => {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        // @ts-ignore: dynamic zod access
        inputSchema: toolDef.inputSchema,
      },
      withScopeEnforcement(toolDef.name, async (args, extra) => {
        try {
          const parsedArgs = toolDef.inputSchema.parse(args ?? {});
          // @ts-ignore: handler expected specific object
          const result = await toolDef.handler(parsedArgs, extra);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
        }
      })
    );
  });
  return server;
}
