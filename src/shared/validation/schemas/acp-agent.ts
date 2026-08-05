import { z } from "zod";

import { isValidVersionCommand } from "@/lib/acp/version-command";

/**
 * Body schema for `POST /api/acp/agents`.
 *
 * The route used to validate against `jsonObjectSchema` — a bare `Record<string, unknown>` — so
 * every field arrived unchecked and the only thing standing between operator input and a stored
 * command this host later executes was the hand-written field check inside the handler. The shape
 * belongs in the schema.
 *
 * `versionCommand` reuses `isValidVersionCommand` rather than restating the metacharacter rule, so
 * the boundary check and the pre-execution check cannot drift apart.
 */

const agentIdSchema = z
  .string()
  .trim()
  .min(1, "id is required")
  .max(64, "id must be 64 characters or fewer");

export const customAgentSchema = z.object({
  id: agentIdSchema,
  name: z.string().trim().min(1, "name is required").max(120),
  binary: z.string().trim().min(1, "binary is required").max(512),
  versionCommand: z
    .string()
    .trim()
    .min(1, "versionCommand is required")
    .max(512)
    .refine(isValidVersionCommand, {
      message:
        "versionCommand must be a plain command such as `mytool --version` — no shell operators, quotes, or redirection",
    }),
  providerAlias: z.string().trim().min(1).max(120).optional(),
  spawnArgs: z.array(z.string()).max(64).optional(),
  protocol: z.enum(["stdio", "http"]).optional(),
});

/** The `{ action: "refresh" }` arm — a control command, not an agent definition. */
export const acpRefreshActionSchema = z.object({
  action: z.literal("refresh"),
});

/**
 * Discriminating on the presence of `action` keeps the refresh command from being forced through
 * the agent shape (and rejected for missing `id`/`name`/`binary`).
 */
export const acpAgentRequestSchema = z.union([acpRefreshActionSchema, customAgentSchema]);
