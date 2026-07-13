// Pure request-shaping helpers for the Codex Responses API.
// Extracted verbatim from executors/codex.ts (no behavior change): endpoint
// path detection used by buildUrl/buildHeaders, wire-value normalization for
// service_tier / reasoning effort, and in-place body sanitizers.

export type CodexRequestBody = Record<string, unknown>;

// Ordered list of effort levels from lowest to highest
export const EFFORT_ORDER = ["none", "low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof EFFORT_ORDER)[number];

const CODEX_FAST_WIRE_VALUE = "priority";

/** Narrow an unknown value to a plain object (never an array), else null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getResponsesSubpath(endpointPath: unknown): string | null {
  const normalizedEndpoint = String(endpointPath || "").replace(/\/+$/, "");
  const match = normalizedEndpoint.match(/(?:^|\/)responses(?:(\/.*))?$/i);
  if (!match) return null;
  return match[1] || "";
}

export function isCompactResponsesEndpoint(endpointPath: unknown): boolean {
  return getResponsesSubpath(endpointPath)?.toLowerCase() === "/compact";
}

/** "fast" is the client-facing alias for the "priority" service tier wire value. */
export function normalizeServiceTierValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "fast") return CODEX_FAST_WIRE_VALUE;
  return normalized;
}

/** "max" is the client-facing alias for the "xhigh" reasoning effort. */
export function normalizeEffortValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "max") normalized = "xhigh";
  return normalized;
}

/**
 * Maximum reasoning effort allowed per Codex model.
 * Models not listed here default to "xhigh" (unrestricted).
 * Update this table when Codex releases new models with different caps.
 */
const MAX_EFFORT_BY_MODEL: Record<string, EffortLevel> = {
  "gpt-5.3-codex": "xhigh",
  "gpt-5.2-codex": "xhigh",
  "gpt-5.1-codex-max": "xhigh",
  "gpt-5-mini": "high",
  "gpt-5.1-mini": "high",
  "gpt-4.1-mini": "high",
};

/**
 * Clamp reasoning effort to the model's maximum allowed level.
 * Returns the original value if within limits, or the cap if it exceeds it.
 */
export function clampEffort(model: string, requested: string): string {
  const max: EffortLevel = MAX_EFFORT_BY_MODEL[model] ?? "xhigh";
  const reqIdx = EFFORT_ORDER.indexOf(requested as EffortLevel);
  const maxIdx = EFFORT_ORDER.indexOf(max);
  if (reqIdx > maxIdx) {
    console.debug(`[Codex] clampEffort: "${requested}" → "${max}" (model: ${model})`);
    return max;
  }
  return requested;
}

export function convertSystemToDeveloperRole(body: CodexRequestBody): void {
  if (!Array.isArray(body.input)) return;

  for (const item of body.input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role : "";
    const type = typeof record.type === "string" ? record.type : "";
    const isSystemMessage = role === "system" && (!type || type === "message");
    if (isSystemMessage) {
      record.role = "developer";
    }
  }
}

export function stripStoredItemReferences(
  body: CodexRequestBody,
  options: { preservePreviousResponseId?: boolean } = {}
): void {
  const prev = body.previous_response_id;
  const preservePreviousResponseId =
    options.preservePreviousResponseId === true ||
    (typeof prev === "string" &&
      prev.length > 0 &&
      (!Array.isArray(body.input) || body.input.length === 0));
  if (!preservePreviousResponseId) {
    delete body.previous_response_id;
  }
  if (!Array.isArray(body.input)) return;
  const SERVER_ID_PATTERN = /^(rs|fc|resp|msg)_/;
  let strippedCount = 0;
  body.input = body.input.filter((item) => {
    if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) {
      strippedCount++;
      return false;
    }
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).type === "item_reference"
    ) {
      strippedCount++;
      return false;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (
        typeof (item as Record<string, unknown>).id === "string" &&
        SERVER_ID_PATTERN.test((item as Record<string, unknown>).id as string)
      ) {
        delete (item as Record<string, unknown>).id;
        strippedCount++;
      }
    }
    return true;
  });
  if (strippedCount > 0)
    console.debug(
      `[Codex] stripStoredItemReferences: sanitized ${strippedCount} server-generated ID(s)`
    );
}
