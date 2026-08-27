import type { JsonRecord, UsageTokenRecord } from "./types.ts";

export function getOpenAIIntermediateChunks(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const candidate = (value as JsonRecord)._openaiIntermediate;
  return Array.isArray(candidate) ? candidate : [];
}

function resolveToolName(rawName: string, toolNameMap: unknown): string {
  if (toolNameMap instanceof Map) {
    const mapped = toolNameMap.get(rawName);
    if (typeof mapped === "string" && mapped.trim().length > 0) {
      return mapped;
    }
  }
  if (rawName.startsWith("proxy_") && rawName.length > "proxy_".length) {
    return rawName.slice("proxy_".length);
  }
  return rawName;
}

export function restoreClaudePassthroughToolUseName(
  parsed: JsonRecord,
  toolNameMap: unknown
): boolean {
  if (!parsed || typeof parsed !== "object") return false;

  const block =
    parsed.content_block && typeof parsed.content_block === "object"
      ? (parsed.content_block as JsonRecord)
      : null;
  if (!block || block.type !== "tool_use" || typeof block.name !== "string") return false;

  const restoredName = resolveToolName(block.name, toolNameMap);
  if (restoredName === block.name) return false;
  block.name = restoredName;
  return true;
}

export function collapseExactDuplicateAssistantText(value: string): string {
  let text = typeof value === "string" ? value : "";
  for (let pass = 0; pass < 3; pass += 1) {
    const len = text.length;
    if (len < 4) break;

    let collapsed = false;
    const mid = Math.floor(len / 2);
    for (let offset = -3; offset <= 3; offset += 1) {
      const splitAt = mid + offset;
      if (splitAt <= 0 || splitAt >= len) continue;
      const first = text.slice(0, splitAt);
      const second = text.slice(splitAt).replace(/^\s+/, "");
      if (first !== second) continue;
      if (!/[\s.!?;:,)\]]$/.test(first)) continue;
      text = first;
      collapsed = true;
      break;
    }
    if (!collapsed) break;
  }
  return text;
}

/**
 * Non-destructively merge a freshly-extracted usage record into an accumulator.
 *
 * `extractUsage()` normalizes each SSE event on its own — a Claude `message_delta`
 * that only carries `output_tokens` normalizes to `{ prompt_tokens: 0,
 * completion_tokens: N }`. Assigning that result directly onto the accumulator
 * (`target = extracted`) wipes out `prompt_tokens`/cache fields captured from an
 * earlier event (e.g. `message_start`), which zeroes billed prompt tokens for the
 * rest of the stream — a real 79%+ cost undercharge in translate mode. Only
 * overwrite a field when the newly extracted value is actually present/positive,
 * mirroring the passthrough Claude-SSE branch above (proven correct) and the
 * flush-handler's remaining-buffer merge.
 */
export function mergeUsageNonDestructive(
  target: UsageTokenRecord | null | undefined,
  extracted: UsageTokenRecord | null | undefined
): UsageTokenRecord | null | undefined {
  if (!extracted) return target;
  const eu = extracted as Record<string, number>;
  if (!target) return { ...eu };
  const merged: UsageTokenRecord = { ...target };
  if (typeof eu.prompt_tokens === "number" && eu.prompt_tokens > 0) {
    merged.prompt_tokens = eu.prompt_tokens;
  }
  if (typeof eu.completion_tokens === "number" && eu.completion_tokens > 0) {
    merged.completion_tokens = eu.completion_tokens;
  }
  if (typeof eu.total_tokens === "number" && eu.total_tokens > 0) {
    merged.total_tokens = eu.total_tokens;
  }
  if (typeof eu.cache_read_input_tokens === "number" && eu.cache_read_input_tokens > 0) {
    merged.cache_read_input_tokens = eu.cache_read_input_tokens;
  }
  if (typeof eu.cache_creation_input_tokens === "number" && eu.cache_creation_input_tokens > 0) {
    merged.cache_creation_input_tokens = eu.cache_creation_input_tokens;
  }
  if (typeof eu.cached_tokens === "number" && eu.cached_tokens > 0) {
    merged.cached_tokens = eu.cached_tokens;
  }
  if (typeof eu.reasoning_tokens === "number" && eu.reasoning_tokens > 0) {
    merged.reasoning_tokens = eu.reasoning_tokens;
  }
  // Deep-merge the details objects instead of dropping them: some providers
  // (e.g. DashScope/Qwen-style) report usage on every chunk but only attach
  // cache-creation/reasoning breakdown details on the final chunk. A scalar-only
  // merge above would silently discard prompt_tokens_details/
  // completion_tokens_details captured on this or an earlier event.
  const targetUnknown = target as Record<string, unknown>;
  const extractedUnknown = extracted as Record<string, unknown>;
  const targetPromptDetails = targetUnknown.prompt_tokens_details as
    Record<string, number> | undefined;
  const euPromptDetails = extractedUnknown.prompt_tokens_details as
    Record<string, number> | undefined;
  if (targetPromptDetails || euPromptDetails) {
    merged.prompt_tokens_details = { ...targetPromptDetails, ...euPromptDetails } as Record<
      string,
      number
    >;
  }
  const targetCompletionDetails = targetUnknown.completion_tokens_details as
    Record<string, number> | undefined;
  const euCompletionDetails = extractedUnknown.completion_tokens_details as
    Record<string, number> | undefined;
  if (targetCompletionDetails || euCompletionDetails) {
    merged.completion_tokens_details = {
      ...targetCompletionDetails,
      ...euCompletionDetails,
    } as Record<string, number>;
  }
  // An `estimated: true` flag on `target` describes a purely heuristic
  // snapshot. Once ANY real, provider-reported field from `extracted` has
  // been merged in above, the result is no longer a pure estimate — carrying
  // the flag forward would mislabel real merged numbers as estimated.
  delete merged.estimated;
  return merged;
}
