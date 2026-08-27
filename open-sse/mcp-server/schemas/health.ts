import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 1: routiform_get_health ---
export const getHealthInput = z.object({}).describe("No parameters required");

export const getHealthOutput = z.object({
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
  cryptography: z
    .object({
      status: z.enum(["healthy", "missing_or_invalid"]),
      provider: z.string(),
    })
    .optional(),
});

export const getHealthTool: McpToolDefinition<typeof getHealthInput, typeof getHealthOutput> = {
  name: "routiform_get_health",
  description:
    "Returns the current health status of Routiform including uptime, memory usage, circuit breaker states for all providers, rate limit status, and cache statistics.",
  inputSchema: getHealthInput,
  outputSchema: getHealthOutput,
  scopes: ["read:health"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/monitoring/health", "/api/resilience", "/api/rate-limits"],
};

// --- Tool 5: routiform_check_quota ---
export const checkQuotaInput = z.object({
  provider: z
    .string()
    .optional()
    .describe(
      "Filter by provider name (e.g., 'claude', 'gemini'). If omitted, returns all providers."
    ),
  connectionId: z.string().optional().describe("Filter by specific connection ID"),
});

export const checkQuotaOutput = z.object({
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

export const checkQuotaTool: McpToolDefinition<typeof checkQuotaInput, typeof checkQuotaOutput> = {
  name: "routiform_check_quota",
  description:
    "Checks the remaining API quota for one or all providers. Returns quota used/total, percentage remaining, reset time, and token health status.",
  inputSchema: checkQuotaInput,
  outputSchema: checkQuotaOutput,
  scopes: ["read:quota"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/api/usage/quota", "/api/token-health", "/api/rate-limits"],
};

// --- Tool 14: routiform_get_provider_metrics ---
export const getProviderMetricsInput = z.object({
  provider: z.string().describe("Provider name (e.g., 'claude', 'gemini', 'codex')"),
});

export const getProviderMetricsOutput = z.object({
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

export const getProviderMetricsTool: McpToolDefinition<
  typeof getProviderMetricsInput,
  typeof getProviderMetricsOutput
> = {
  name: "routiform_get_provider_metrics",
  description:
    "Returns detailed performance metrics for a specific provider including success/error rates, latency percentiles (p50/p95/p99), circuit breaker state, and quota information.",
  inputSchema: getProviderMetricsInput,
  outputSchema: getProviderMetricsOutput,
  scopes: ["read:health"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/provider-metrics", "/api/resilience"],
};
