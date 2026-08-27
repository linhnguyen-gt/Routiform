import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

// --- Tool 8: routiform_list_models_catalog ---
export const listModelsCatalogInput = z.object({
  provider: z.string().optional().describe("Filter by provider name"),
  capability: z
    .enum(["chat", "embedding", "image", "audio", "video", "rerank", "moderation"])
    .optional()
    .describe("Filter by model capability"),
});

export const listModelsCatalogOutput = z.object({
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

export const listModelsCatalogTool: McpToolDefinition<
  typeof listModelsCatalogInput,
  typeof listModelsCatalogOutput
> = {
  name: "routiform_list_models_catalog",
  description:
    "Lists all available AI models across all providers with their capabilities, current status, and pricing information.",
  inputSchema: listModelsCatalogInput,
  outputSchema: listModelsCatalogOutput,
  scopes: ["read:models"],
  auditLevel: "none",
  phase: 1,
  sourceEndpoints: ["/api/models/catalog", "/v1/models"],
};

// --- Tool 18: routiform_sync_pricing ---
export const syncPricingInput = z.object({
  sources: z
    .array(z.string())
    .optional()
    .describe("External pricing sources to sync from (default: ['litellm'])"),
  dryRun: z
    .boolean()
    .optional()
    .describe("If true, preview sync results without saving to database"),
});

export const syncPricingOutput = z.object({
  success: z.boolean(),
  modelCount: z.number(),
  providerCount: z.number(),
  source: z.string(),
  dryRun: z.boolean(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  data: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export const syncPricingTool: McpToolDefinition<typeof syncPricingInput, typeof syncPricingOutput> =
  {
    name: "routiform_sync_pricing",
    description:
      "Syncs pricing data from external sources (LiteLLM) into Routiform. Synced pricing fills gaps not covered by hardcoded defaults without overwriting user-set prices. Use dryRun=true to preview.",
    inputSchema: syncPricingInput,
    outputSchema: syncPricingOutput,
    scopes: ["pricing:write"],
    auditLevel: "full",
    phase: 2,
    sourceEndpoints: ["/api/pricing/sync"],
  };

// --- Tool: routiform_list_free_tiers ---
export const listFreeTiersInput = z.object({
  kind: z
    .enum(["forever", "signup-credit", "daily", "rate-limited", "oauth-sub"])
    .optional()
    .describe("Optional filter by free-tier kind"),
});

export const listFreeTiersOutput = z.object({
  total: z.number(),
  forever: z.number(),
  oauthSub: z.number(),
  approxKnownMonthlyTokens: z.number(),
  entries: z.array(
    z.object({
      providerId: z.string(),
      name: z.string(),
      kind: z.string(),
      summary: z.string(),
      approxTokensPerMonth: z.number().nullable(),
      notes: z.string().optional(),
    })
  ),
});

export const listFreeTiersTool: McpToolDefinition<
  typeof listFreeTiersInput,
  typeof listFreeTiersOutput
> = {
  name: "routiform_list_free_tiers",
  description:
    "Lists documented free / freemium provider tiers in the Routiform catalog (static notes, not live remaining quota).",
  inputSchema: listFreeTiersInput,
  outputSchema: listFreeTiersOutput,
  scopes: ["read:providers"],
  auditLevel: "basic",
  phase: 1,
  sourceEndpoints: ["/dashboard/free-tiers"],
};
