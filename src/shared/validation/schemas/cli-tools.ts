import { z } from "zod";

export const cliMitmStartSchema = z.object({
  apiKey: z.string().trim().min(1, "Missing apiKey"),
  sudoPassword: z.string().optional(),
});

export const cliMitmStopSchema = z.object({
  sudoPassword: z.string().optional(),
});

export const cliMitmAliasUpdateSchema = z.object({
  tool: z.string().trim().min(1, "tool and mappings required"),
  mappings: z.record(z.string(), z.string().optional()),
});

export const cliBackupMutationSchema = z
  .object({
    tool: z.string().trim().min(1).optional(),
    toolId: z.string().trim().min(1).optional(),
    backupId: z.string().trim().min(1, "tool and backupId are required"),
  })
  .superRefine((value, ctx) => {
    if (!value.tool && !value.toolId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tool and backupId are required",
        path: ["tool"],
      });
    }
  });

const envKeySchema = z
  .string()
  .trim()
  .min(1, "Environment key is required")
  .max(120)
  .regex(/^[A-Z_][A-Z0-9_]*$/, "Invalid environment key format");
const envValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value))
  .refine((value) => value.length > 0, "Environment value is required")
  .refine((value) => value.length <= 10_000, "Environment value is too long");

export const cliSettingsEnvSchema = z.object({
  env: z
    .record(envKeySchema, envValueSchema)
    .refine((value) => Object.keys(value).length > 0, "env must contain at least one key"),
});

export const cliModelConfigSchema = z
  .object({
    baseUrl: z.string().trim().min(1, "baseUrl and model are required"),
    apiKey: z.string().optional(),
    keyId: z.string().optional(),
    model: z.string().trim().min(1, "baseUrl and model are required"),
  })
  .strict();

export const coworkSettingsSchema = z.object({
  baseUrl: z.string().trim().min(1, "baseUrl is required"),
  apiKey: z.string().optional(),
  keyId: z.string().optional(),
  models: z.array(z.string().trim().min(1)).min(1, "At least one model is required"),
});

export const hermesSettingsSchema = z.object({
  baseUrl: z.string().trim().min(1, "baseUrl is required"),
  apiKey: z.string().optional(),
  keyId: z.string().optional(),
  model: z.string().trim().min(1, "model is required"),
});

export const codexProfileNameSchema = z.object({
  name: z.string().trim().min(1, "Profile name is required"),
});

export const codexProfileIdSchema = z.object({
  profileId: z.string().trim().min(1, "profileId is required"),
});

export const guideSettingsSaveSchema = z.object({
  baseUrl: z.string().trim().min(1).optional(),
  apiKey: z.string().optional(),
  model: z.string().trim().min(1, "Model is required"),
});

export const opencodeGuideSettingsSaveSchema = z
  .object({
    baseUrl: z.string().trim().min(1).optional(),
    apiKey: z.string().optional(),
    model: z.string().trim().min(1, "Model is required").optional(),
    models: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.model && (!Array.isArray(value.models) || value.models.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one model is required",
        path: ["models"],
      });
    }
  });
