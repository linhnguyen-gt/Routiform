import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 12: routiform_set_resilience_profile ---
export const setResilienceProfileInput = z.object({
  profile: z
    .enum(["aggressive", "balanced", "conservative"])
    .describe("Resilience profile to apply"),
});

export const setResilienceProfileOutput = z.object({
  applied: z.boolean(),
  settings: z.object({
    circuitBreakerThreshold: z.number(),
    retryCount: z.number(),
    timeoutMs: z.number(),
    fallbackDepth: z.number(),
  }),
});

export const setResilienceProfileTool: McpToolDefinition<
  typeof setResilienceProfileInput,
  typeof setResilienceProfileOutput
> = {
  name: "routiform_set_resilience_profile",
  description:
    "Applies a resilience profile that adjusts circuit breaker thresholds, retry counts, timeouts, and fallback depth. 'aggressive' = fast fail, 'conservative' = max retries.",
  inputSchema: setResilienceProfileInput,
  outputSchema: setResilienceProfileOutput,
  scopes: ["write:resilience"],
  auditLevel: "full",
  phase: 2,
  sourceEndpoints: ["/api/resilience"],
};
