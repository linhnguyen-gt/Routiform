import { z } from "zod";

const ipFilterModeSchema = z.enum(["blacklist", "whitelist"]);
const tempBanSchema = z.object({
  ip: z.string().trim().min(1),
  durationMs: z.coerce.number().int().min(1).optional(),
  reason: z.string().max(200).optional(),
});

export const updateIpFilterSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: ipFilterModeSchema.optional(),
    blacklist: z.array(z.string()).optional(),
    whitelist: z.array(z.string()).optional(),
    addBlacklist: z.string().optional(),
    removeBlacklist: z.string().optional(),
    addWhitelist: z.string().optional(),
    removeWhitelist: z.string().optional(),
    tempBan: tempBanSchema.optional(),
    removeBan: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No valid fields to update",
        path: [],
      });
    }
  });

export const updateModelAliasesSchema = z.object({
  aliases: z.record(z.string().trim().min(1), z.string().trim().min(1)),
});

export const addModelAliasSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export const removeModelAliasSchema = z.object({
  from: z.string().trim().min(1),
});

// Union across providers — mirrors MODEL_EFFORT_OPTIONS in
// `src/shared/constants/reasoning-effort.ts`. `none` is OpenAI/Codex-only and
// `max` is Anthropic-only; the request path downgrades levels a provider lacks.
const MODEL_REASONING_EFFORT_ENUM = z.enum(["none", "low", "medium", "high", "xhigh", "max"]);

export const updateModelReasoningDefaultsSchema = z.object({
  defaults: z.record(z.string().trim().min(3), MODEL_REASONING_EFFORT_ENUM),
});

export const addModelReasoningDefaultSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  effort: MODEL_REASONING_EFFORT_ENUM,
});

export const removeModelReasoningDefaultSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
});
