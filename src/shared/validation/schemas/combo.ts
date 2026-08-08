import { z } from "zod";
import {
  COMBO_CONTEXT_LENGTH_BOUNDS,
  COMBO_MAX_OUTPUT_TOKENS_BOUNDS,
} from "@/shared/constants/combo-defaults";
import {
  comboConfigSchema,
  comboModelEntry,
  comboRuntimeConfigSchema,
  comboStrategySchema,
  scoringWeightsSchema,
} from "@/shared/validation/schemas/combo-internal";

/**
 * A hand-set token limit, or `null` to fall back to the measured default.
 *
 * `null` is meaningful and not the same as omitting the field: an update merges its body
 * into the stored record, so a combo that wants the default back has to say so explicitly —
 * leaving the field out would keep whatever was stored before.
 */
const comboContextLength = z
  .number()
  .int()
  .min(COMBO_CONTEXT_LENGTH_BOUNDS.min)
  .max(COMBO_CONTEXT_LENGTH_BOUNDS.max)
  .nullable()
  .optional();

const comboMaxOutputTokens = z
  .number()
  .int()
  .min(COMBO_MAX_OUTPUT_TOKENS_BOUNDS.min)
  .max(COMBO_MAX_OUTPUT_TOKENS_BOUNDS.max)
  .nullable()
  .optional();

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
  context_length: comboContextLength,
  max_output_tokens: comboMaxOutputTokens,
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
    context_length: comboContextLength,
    max_output_tokens: comboMaxOutputTokens,
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
