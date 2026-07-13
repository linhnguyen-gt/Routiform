import { getTargetFormat } from "../services/provider.ts";
import { FORMATS } from "../translator/formats.ts";

/**
 * Build the additive (cache-EXCLUSIVE input_tokens) Claude usage shape.
 * `prompt_tokens` must stay cache-INCLUSIVE (input + cache_read + cache_creation)
 * to match the convention every downstream consumer (cost accounting,
 * dashboards, tokenAccounting.getLoggedInputTokens) expects.
 */
function buildClaudeUsage(usage) {
  const inputTokens = usage.input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;

  return {
    prompt_tokens: inputTokens + cacheRead + cacheCreation,
    completion_tokens: usage.output_tokens || 0,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
  };
}

/**
 * Extract usage from non-streaming response body
 * Handles different provider response formats
 *
 * @param {object} responseBody - Raw (untranslated) response body from the provider
 * @param {string} provider - Provider id (e.g. "anthropic", "github"); used to resolve
 *   the wire format via the same registry-driven lookup the pipeline itself uses
 *   (see services/provider.ts#getTargetFormat) when `format` isn't supplied directly.
 * @param {string} [format] - Explicit wire format (a FORMATS.* value), when the caller
 *   already resolved it (e.g. including per-model targetFormat overrides). Takes
 *   priority over `provider`-based resolution.
 */
export function extractUsageFromResponse(responseBody, provider, format) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // OpenAI format (has prompt_tokens / completion_tokens) — unambiguous field name,
  // never used by Claude or the OpenAI Responses API, so no format resolution needed.
  if (
    responseBody.usage &&
    typeof responseBody.usage === "object" &&
    responseBody.usage.prompt_tokens !== undefined
  ) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens,
    };
  }

  const usage = responseBody.usage;

  // Claude Messages API format — MUST be resolved before the generic OpenAI
  // Responses API branch below. Both shapes use `input_tokens`/`output_tokens`
  // field names, but Anthropic's `input_tokens` is cache-EXCLUSIVE while the
  // OpenAI Responses API's `input_tokens` is cache-INCLUSIVE. Using the wrong
  // formula here undercharges every cached/cache-creation Claude request (a
  // real production regression).
  //
  // Previously this branch was gated on `cache_creation_input_tokens !== undefined`
  // as a "reliable Anthropic marker" — it is not: any Anthropic-compatible
  // upstream that reports `cache_read_input_tokens` WITHOUT `cache_creation_input_tokens`
  // (a valid, spec-compliant Anthropic response — the field is just 0/omitted)
  // fell through to the Responses branch and had its cache-EXCLUSIVE input_tokens
  // read as cache-INCLUSIVE, undercharging the request. Field presence is just a
  // different guess; key off the actual wire format instead — the pipeline
  // already knows it (see getTargetFormat / registry `format` per provider).
  const resolvedFormat = format || (provider ? getTargetFormat(provider) : undefined);

  if (
    resolvedFormat === FORMATS.CLAUDE &&
    usage &&
    typeof usage === "object" &&
    (usage.input_tokens !== undefined || usage.output_tokens !== undefined)
  ) {
    return buildClaudeUsage(usage);
  }

  // Fallback for providers whose registry entry reports a non-Claude base format
  // but individual models actually speak native Anthropic wire protocol (e.g.
  // opencode-go's `minimax-m2.x` models carry a per-model `targetFormat: "claude"`
  // override — see registry-providers-apikey.ts). This function only receives the
  // provider id, not the resolved model, so it cannot see that override; keep the
  // old field marker as a narrow safety net for that specific case only — it is
  // no longer the primary Claude/Responses disambiguation mechanism.
  if (
    resolvedFormat !== FORMATS.CLAUDE &&
    usage &&
    typeof usage === "object" &&
    usage.cache_creation_input_tokens !== undefined &&
    (usage.input_tokens !== undefined || usage.output_tokens !== undefined)
  ) {
    return buildClaudeUsage(usage);
  }

  // OpenAI Responses API format (input_tokens / output_tokens, cache-INCLUSIVE)
  const responsesUsage = responseBody.response?.usage || responseBody.usage;
  if (
    responsesUsage &&
    typeof responsesUsage === "object" &&
    (responsesUsage.input_tokens !== undefined || responsesUsage.output_tokens !== undefined)
  ) {
    return {
      prompt_tokens: responsesUsage.input_tokens || 0,
      completion_tokens: responsesUsage.output_tokens || 0,
      cache_read_input_tokens: responsesUsage.cache_read_input_tokens,
      cached_tokens:
        responsesUsage.input_tokens_details?.cached_tokens ??
        responsesUsage.cache_read_input_tokens,
      cache_creation_input_tokens: responsesUsage.cache_creation_input_tokens,
      reasoning_tokens:
        responsesUsage.reasoning_tokens || responsesUsage.output_tokens_details?.reasoning_tokens,
    };
  }

  // Gemini format
  if (responseBody.usageMetadata && typeof responseBody.usageMetadata === "object") {
    return {
      prompt_tokens: responseBody.usageMetadata.promptTokenCount || 0,
      completion_tokens: responseBody.usageMetadata.candidatesTokenCount || 0,
      // cachedContentTokenCount must be carried forward — dropping it (as this
      // branch previously did) bills cached tokens at full input price instead
      // of the cheaper cached rate (an overcharge). Mirrors the streaming
      // extractUsage() mapping in utils/usageTracking.ts so non-stream and
      // stream Gemini usage agree.
      cached_tokens: responseBody.usageMetadata.cachedContentTokenCount,
      reasoning_tokens: responseBody.usageMetadata.thoughtsTokenCount,
    };
  }

  return null;
}
