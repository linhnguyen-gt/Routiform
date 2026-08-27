import { CLAUDE_CODE_COMPATIBLE_DEFAULT_MAX_TOKENS } from "./constants.ts";
import { readNestedString, toNonEmptyString } from "./shared.ts";

export function resolveClaudeCodeCompatibleEffort(
  sourceBody?: Record<string, unknown> | null,
  normalizedBody?: Record<string, unknown> | null,
  model?: string | null
): "low" | "medium" | "high" {
  const raw =
    readNestedString(sourceBody, ["output_config", "effort"]) ||
    readNestedString(sourceBody, ["reasoning", "effort"]) ||
    toNonEmptyString(sourceBody?.["reasoning_effort"]) ||
    readNestedString(normalizedBody, ["output_config", "effort"]) ||
    readNestedString(normalizedBody, ["reasoning", "effort"]) ||
    toNonEmptyString(normalizedBody?.["reasoning_effort"]) ||
    "";

  const normalizedEffort = raw.toLowerCase();
  void model;

  if (!normalizedEffort) return "high";
  if (normalizedEffort === "low") return "low";
  if (normalizedEffort === "medium") return "medium";
  if (normalizedEffort === "high") return "high";
  if (normalizedEffort === "none" || normalizedEffort === "disabled") return "low";
  if (normalizedEffort === "max" || normalizedEffort === "xhigh") {
    return "high";
  }
  return "high";
}

export function resolveClaudeCodeCompatibleMaxTokens(
  sourceBody?: Record<string, unknown> | null,
  normalizedBody?: Record<string, unknown> | null
): number {
  const candidates = [
    sourceBody?.["max_tokens"],
    sourceBody?.["max_completion_tokens"],
    sourceBody?.["max_output_tokens"],
    normalizedBody?.["max_tokens"],
    normalizedBody?.["max_completion_tokens"],
    normalizedBody?.["max_output_tokens"],
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }

  return CLAUDE_CODE_COMPATIBLE_DEFAULT_MAX_TOKENS;
}
