import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 2: routiform_list_combos ---
export const listCombosInput = z.object({
  includeMetrics: z
    .boolean()
    .optional()
    .describe("Include request count, success rate, latency, and cost metrics per combo"),
});

export const listCombosOutput = z.object({
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

export const listCombosTool: McpToolDefinition<typeof listCombosInput, typeof listCombosOutput> = {
  name: "routiform_list_combos",
  description:
    "Lists all configured combos (model chains) with their strategies and optionally includes performance metrics. Combos define how requests are routed across multiple providers.",
  inputSchema: listCombosInput,
  outputSchema: listCombosOutput,
  scopes: ["read:combos"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/combos", "/api/combos/metrics"],
};

// --- Tool 3: routiform_get_combo_metrics ---
export const getComboMetricsInput = z.object({
  comboId: z.string().describe("ID of the combo to get metrics for"),
});

export const getComboMetricsOutput = z.object({
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

export const getComboMetricsTool: McpToolDefinition<
  typeof getComboMetricsInput,
  typeof getComboMetricsOutput
> = {
  name: "routiform_get_combo_metrics",
  description:
    "Returns detailed performance metrics for a specific combo including request count, success rate, average latency, total cost, and per-provider breakdowns.",
  inputSchema: getComboMetricsInput,
  outputSchema: getComboMetricsOutput,
  scopes: ["read:combos"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/combos/metrics"],
};

// --- Tool 4: routiform_switch_combo ---
export const switchComboInput = z.object({
  comboId: z.string().describe("ID of the combo to activate/deactivate"),
  active: z.boolean().describe("Whether to enable or disable the combo"),
});

export const switchComboOutput = z.object({
  success: z.boolean(),
  combo: z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
  }),
});

export const switchComboTool: McpToolDefinition<typeof switchComboInput, typeof switchComboOutput> =
  {
    name: "routiform_switch_combo",
    description:
      "Activates or deactivates a combo. When deactivated, requests will not be routed through this combo. Use to toggle between different routing strategies.",
    inputSchema: switchComboInput,
    outputSchema: switchComboOutput,
    scopes: ["write:combos"],
    auditLevel: "full",
    phase: 1,
    sourceEndpoints: ["/api/combos"],
  };

// --- Tool 11: routiform_set_routing_strategy ---
export const setRoutingStrategyInput = z.object({
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

export const setRoutingStrategyOutput = z.object({
  success: z.boolean(),
  combo: z.object({
    id: z.string(),
    name: z.string(),
    strategy: z.string(),
    autoRoutingStrategy: z.string().nullable(),
  }),
});

export const setRoutingStrategyTool: McpToolDefinition<
  typeof setRoutingStrategyInput,
  typeof setRoutingStrategyOutput
> = {
  name: "routiform_set_routing_strategy",
  description:
    "Updates a combo routing strategy (priority/weighted/auto/etc.) at runtime. Supports selecting the sub-strategy used by auto mode (rules/cost/latency).",
  inputSchema: setRoutingStrategyInput,
  outputSchema: setRoutingStrategyOutput,
  scopes: ["write:combos"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/combos/{id}"],
};

// --- Tool 13: routiform_test_combo ---
export const testComboInput = z.object({
  comboId: z.string().describe("ID of the combo to test"),
  testPrompt: z.string().max(500).describe("Short test prompt (max 500 chars)"),
});

export const testComboOutput = z.object({
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

export const testComboTool: McpToolDefinition<typeof testComboInput, typeof testComboOutput> = {
  name: "routiform_test_combo",
  description:
    "Tests a combo by sending a short test prompt to each provider in the combo and reporting individual results including latency, cost, and success status.",
  inputSchema: testComboInput,
  outputSchema: testComboOutput,
  scopes: ["execute:completions", "read:combos"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/combos/test", "/v1/chat/completions"],
};

// --- Tool 15: routiform_best_combo_for_task ---
export const bestComboForTaskInput = z.object({
  taskType: z
    .enum(["coding", "review", "planning", "analysis", "debugging", "documentation"])
    .describe("Type of task to find the best combo for"),
  budgetConstraint: z.number().optional().describe("Maximum cost in USD"),
  latencyConstraint: z.number().optional().describe("Maximum acceptable latency in ms"),
});

export const bestComboForTaskOutput = z.object({
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

export const bestComboForTaskTool: McpToolDefinition<
  typeof bestComboForTaskInput,
  typeof bestComboForTaskOutput
> = {
  name: "routiform_best_combo_for_task",
  description:
    "Recommends the best combo for a given task type (coding, review, planning, etc.) considering budget and latency constraints. Also suggests alternatives and free options.",
  inputSchema: bestComboForTaskInput,
  outputSchema: bestComboForTaskOutput,
  scopes: ["read:combos", "read:health"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/combos", "/api/combos/metrics", "/api/monitoring/health"],
};
