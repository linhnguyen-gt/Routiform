import { z } from "zod";
import {
  comboConfigSchema,
  comboModelEntry,
  comboRuntimeConfigSchema,
  comboStrategySchema,
  scoringWeightsSchema,
} from "@/shared/validation/schemas/combo-internal";

export const createComboSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .regex(/^[a-zA-Z0-9_/.-]+$/, "Name can only contain letters, numbers, -, _, / and ."),
  models: z.array(comboModelEntry).optional().default([]),
  strategy: comboStrategySchema.optional().default("priority"),
  config: comboConfigSchema,
  allowedProviders: z.array(z.string().max(200)).optional(),
  system_message: z.string().max(50000).optional(),
  tool_filter_regex: z.string().max(1000).optional(),
  context_cache_protection: z.boolean().optional(),
  context_length: z.number().int().min(1000).max(2000000).optional(),
  max_output_tokens: z.number().int().min(256).max(200000).optional(),
  requireToolCalling: z.boolean().optional(),
});

export const reorderCombosSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one combo ID required"),
});

export const createAutoComboSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(100),
  name: z.string().trim().min(1, "name is required").max(200),
  candidatePool: z.array(z.string().min(1)).optional().default([]),
  weights: scoringWeightsSchema,
  modePack: z.string().max(100).optional(),
  budgetCap: z.number().positive().optional(),
  explorationRate: z.number().min(0).max(1).optional().default(0.05),
});

export const updateComboSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100)
      .regex(/^[a-zA-Z0-9_/.-]+$/, "Name can only contain letters, numbers, -, _, / and .")
      .optional(),
    models: z.array(comboModelEntry).optional(),
    strategy: comboStrategySchema.optional(),
    config: comboRuntimeConfigSchema.optional(),
    isActive: z.boolean().optional(),
    allowedProviders: z.array(z.string().max(200)).optional(),
    system_message: z.string().max(50000).optional(),
    tool_filter_regex: z.string().max(1000).optional(),
    context_cache_protection: z.boolean().optional(),
    context_length: z.number().int().min(1000).max(2000000).optional(),
    max_output_tokens: z.number().int().min(256).max(200000).optional(),
    requireToolCalling: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.models === undefined &&
      value.strategy === undefined &&
      value.config === undefined &&
      value.isActive === undefined &&
      value.allowedProviders === undefined &&
      value.system_message === undefined &&
      value.tool_filter_regex === undefined &&
      value.context_cache_protection === undefined &&
      value.context_length === undefined &&
      value.max_output_tokens === undefined &&
      value.requireToolCalling === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No valid fields to update",
        path: [],
      });
    }
  });

export const testComboSchema = z.object({
  comboName: z.string().trim().min(1, "comboName is required"),
});
