import { z } from "zod";

export const comboModelEntry = z.union([
  z.string(),
  z.object({
    model: z.string().min(1),
    weight: z.number().min(0).max(100).default(0),
    disabled: z.boolean().optional(),
  }),
]);

export const comboConfigSchema = z
  .object({
    maxRetries: z.number().int().min(0).max(10).optional(),
    requestRetry: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().min(0).max(60000).optional(),
    maxRetryIntervalSec: z.number().int().min(1).max(300).optional(),
    timeoutMs: z.number().int().min(1000).max(600000).optional(),
    healthCheckEnabled: z.boolean().optional(),
  })
  .optional();

export const comboStrategySchema = z.enum([
  "priority",
  "weighted",
  "round-robin",
  "random",
  "least-used",
  "cost-optimized",
  "strict-random",
  "auto",
  "fill-first",
  "p2c",
  "lkgp",
  "headroom",
  "context-optimized",
]);

export const scoringWeightsSchema = z
  .object({
    quota: z.number().min(0).max(1),
    health: z.number().min(0).max(1),
    costInv: z.number().min(0).max(1),
    latencyInv: z.number().min(0).max(1),
    taskFit: z.number().min(0).max(1),
    stability: z.number().min(0).max(1),
    tierPriority: z.number().min(0).max(1).optional().default(0.05),
  })
  .optional();

export const comboRuntimeConfigSchema = z
  .object({
    strategy: comboStrategySchema.optional(),
    maxRetries: z.coerce.number().int().min(0).max(10).optional(),
    requestRetry: z.coerce.number().int().min(0).max(10).optional(),
    retryDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
    maxRetryIntervalSec: z.coerce.number().int().min(1).max(300).optional(),
    timeoutMs: z.coerce.number().int().min(1000).max(600000).optional(),
    concurrencyPerModel: z.coerce.number().int().min(1).max(20).optional(),
    queueTimeoutMs: z.coerce.number().int().min(1000).max(120000).optional(),
    healthCheckEnabled: z.boolean().optional(),
    healthCheckTimeoutMs: z.coerce.number().int().min(100).max(30000).optional(),
    maxComboDepth: z.coerce.number().int().min(1).max(10).optional(),
    trackMetrics: z.boolean().optional(),
    candidatePool: z.array(z.string().min(1)).optional(),
    weights: scoringWeightsSchema.optional(),
    modePack: z.string().max(100).optional(),
    budgetCap: z.number().positive().optional(),
    explorationRate: z.number().min(0).max(1).optional(),
    routerStrategy: z.string().optional(),
  })
  .strict();
