/**
 * Reasoning effort levels accepted by the model-defaults API.
 * Mirrors the server-side enum in `settings-ip-aliases-reasoning.ts`.
 *
 * This is the union across providers, not the set any single model accepts:
 * `none` exists only on OpenAI/Codex, `max` only on Anthropic (where it sits
 * above `xhigh`). Sending a level the target provider lacks is safe — the
 * request path downgrades `max` to `xhigh` and then to `high` for providers
 * that do not support them.
 */
export const MODEL_EFFORT_OPTIONS = ["none", "low", "medium", "high", "xhigh", "max"] as const;

export type ModelEffort = (typeof MODEL_EFFORT_OPTIONS)[number];

/** Effort applied to a model the first time it is picked. */
export const DEFAULT_MODEL_EFFORT: ModelEffort = "high";

export function isModelEffort(value: unknown): value is ModelEffort {
  return typeof value === "string" && (MODEL_EFFORT_OPTIONS as readonly string[]).includes(value);
}
