import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 6: routiform_route_request ---
export const routeRequestInput = z.object({
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
  stream: z.boolean().optional().default(false).describe("Whether to stream the response"),
});

export const routeRequestOutput = z.object({
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

export const routeRequestTool: McpToolDefinition<
  typeof routeRequestInput,
  typeof routeRequestOutput
> = {
  name: "routiform_route_request",
  description:
    "Sends a chat completion request through Routiform's intelligent routing pipeline. Supports combo selection for optimal provider matching. The response is always non-streaming.",
  inputSchema: routeRequestInput,
  outputSchema: routeRequestOutput,
  scopes: ["execute:completions"],
  auditLevel: "full",
  phase: 1,
  sourceEndpoints: ["/v1/chat/completions", "/v1/responses"],
};

// --- Tool 7: routiform_cost_report ---
export const costReportInput = z.object({
  period: z
    .enum(["session", "day", "week", "month"])
    .optional()
    .default("session")
    .describe("Time period for the cost report"),
});

export const costReportOutput = z.object({
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

export const costReportTool: McpToolDefinition<typeof costReportInput, typeof costReportOutput> = {
  name: "routiform_cost_report",
  description:
    "Generates a cost report for the specified period showing total cost, request count, token usage, and breakdowns by provider and model. Also shows budget status if configured.",
  inputSchema: costReportInput,
  outputSchema: costReportOutput,
  scopes: ["read:usage"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/usage/analytics", "/api/usage/budget"],
};

// --- Tool 10: routiform_set_budget_guard ---
export const setBudgetGuardInput = z.object({
  maxCost: z.number().describe("Maximum cost in USD for this session"),
  action: z.enum(["degrade", "block", "alert"]).describe("Action when budget is exceeded"),
  degradeToTier: z
    .enum(["cheap", "free"])
    .optional()
    .describe("If action=degrade, which tier to fall back to"),
});

export const setBudgetGuardOutput = z.object({
  sessionId: z.string(),
  budgetTotal: z.number(),
  budgetSpent: z.number(),
  budgetRemaining: z.number(),
  action: z.string(),
  status: z.enum(["active", "warning", "exceeded"]),
});

export const setBudgetGuardTool: McpToolDefinition<
  typeof setBudgetGuardInput,
  typeof setBudgetGuardOutput
> = {
  name: "routiform_set_budget_guard",
  description:
    "Records a budget guard for the current session and reports spend against it. Report-only: it does NOT block or degrade requests; the action field is informational.",
  inputSchema: setBudgetGuardInput,
  outputSchema: setBudgetGuardOutput,
  scopes: ["write:budget"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/usage/budget"],
};

// --- Tool 17: routiform_get_session_snapshot ---
export const getSessionSnapshotInput = z.object({}).describe("No parameters required");

export const getSessionSnapshotOutput = z.object({
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

export const getSessionSnapshotTool: McpToolDefinition<
  typeof getSessionSnapshotInput,
  typeof getSessionSnapshotOutput
> = {
  name: "routiform_get_session_snapshot",
  description:
    "Returns a snapshot of the current working session including duration, request count, total cost, top models/providers used, error count, and budget guard status.",
  inputSchema: getSessionSnapshotInput,
  outputSchema: getSessionSnapshotOutput,
  scopes: ["read:usage"],
  auditLevel: "none",
  phase: 2,
  sourceEndpoints: ["/api/usage/analytics", "/api/telemetry/summary"],
};
