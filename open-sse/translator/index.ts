import { getRegistryEntry } from "../config/providerRegistry.ts";
import { normalizeThinkingConfig } from "../services/provider.ts";
import { lookupReasoning, requiresReasoningReplay } from "../services/reasoningCache.ts";
import { normalizeRoles } from "../services/roleNormalizer.ts";
import { applyThinkingBudget } from "../services/thinkingBudget.ts";
import { bootstrapTranslatorRegistry } from "./bootstrap.ts";
import { FORMATS } from "./formats.ts";
import { prepareClaudeRequest } from "./helpers/claudeHelper.ts";
import { filterToOpenAIFormat } from "./helpers/openaiHelper.ts";
import {
  coerceToolCallArguments,
  coerceToolSchemas,
  injectEmptyReasoningContent,
  injectEmptyReasoningContentForToolCalls,
  isReasoner,
  sanitizeToolDescriptions,
} from "./helpers/schemaCoercion.ts";
import { ensureToolCallIds, fixMissingToolResponses } from "./helpers/toolCallHelper.ts";
import { getRequestTranslator, getResponseTranslator } from "./registry.ts";

bootstrapTranslatorRegistry();
export { register } from "./registry.ts";

function normalizeResponsesInputItem(item) {
  if (typeof item === "string") {
    return {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: item }],
    };
  }

  if (!item || typeof item !== "object") return item;

  if (item.type || item.role) {
    return item.type ? item : { type: "message", ...item };
  }

  if (typeof item.text === "string") {
    return {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: item.text }],
    };
  }

  return item;
}

function normalizeOpenAIResponsesRequest(body) {
  if (!body || typeof body !== "object") return body;

  const normalized = { ...body };

  if (typeof normalized.input === "string") {
    normalized.input = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: normalized.input }],
      },
    ];
    return normalized;
  }

  if (Array.isArray(normalized.input)) {
    normalized.input = normalized.input.map(normalizeResponsesInputItem);
    return normalized;
  }

  if (normalized.input && typeof normalized.input === "object") {
    normalized.input = [normalizeResponsesInputItem(normalized.input)];
    return normalized;
  }

  return normalized;
}

/** @param options.normalizeToolCallId - When true, use 9-char tool call ids (e.g. Mistral); when false, leave ids as-is */
/** @param options.preserveDeveloperRole - undefined/true: keep developer for OpenAI format (default); false: map to system */
/** @param options.preserveCacheControl - When true, preserve client-side cache_control markers (for Claude Code, etc.) */
// Translate request: source -> openai -> target
export function translateRequest(
  sourceFormat,
  targetFormat,
  model,
  body,
  stream = true,
  credentials = null,
  provider = null,
  reqLogger = null,
  options?: {
    normalizeToolCallId?: boolean;
    preserveDeveloperRole?: boolean;
    preserveCacheControl?: boolean;
  }
) {
  let result = body;
  const use9CharId = options?.normalizeToolCallId === true;
  const preserveDeveloperRole = options?.preserveDeveloperRole;

  // Phase 2: Apply thinking budget control before normalization
  result = applyThinkingBudget(result);

  // Normalize thinking config: remove if lastMessage is not user
  normalizeThinkingConfig(result);

  // Ensure tool_calls have id; optionally normalize to 9-char for providers like Mistral
  ensureToolCallIds(result, { use9CharId });

  // Fix missing tool responses (insert empty tool_result if needed)
  fixMissingToolResponses(result);

  // Normalize roles: developer→system unless preserved, system→user for incompatible models.
  // This handles (1) sourceFormat openai with messages containing developer → non-openai target
  // or preserveDeveloperRole=false, and (2) all other paths where result.messages already exists.
  if (result.messages && Array.isArray(result.messages)) {
    result.messages = normalizeRoles(
      result.messages,
      provider || "",
      model || "",
      targetFormat,
      preserveDeveloperRole
    );
  }

  // If same format, skip translation steps
  if (sourceFormat !== targetFormat) {
    // Check for direct translation path first (e.g., Claude → Gemini)
    const directTranslator = getRequestTranslator(sourceFormat, targetFormat);
    if (directTranslator && sourceFormat !== FORMATS.OPENAI && targetFormat !== FORMATS.OPENAI) {
      result = directTranslator(model, result, stream, credentials);
    } else {
      // Fallback: hub-and-spoke via OpenAI
      // Step 1: source -> openai (if source is not openai)
      if (sourceFormat !== FORMATS.OPENAI) {
        const toOpenAI = getRequestTranslator(sourceFormat, FORMATS.OPENAI);
        if (toOpenAI) {
          result = toOpenAI(model, result, stream, credentials);

          // NOTE: system messages are intentionally NOT stripped here when targeting Kiro.
          // buildKiroPayload() (openai-to-kiro.ts) consumes role:"system" messages from this
          // intermediate OpenAI-shaped body and prepends them as a single <instructions> block
          // on the current message content — Kiro has no dedicated system field. Stripping them
          // here (as a prior revision did, based on the now-disproven belief that "Kiro uses its
          // own internal system instructions") silently dropped the system prompt for every
          // hub-and-spoke source format, including claude -> openai -> kiro (Claude Code, the
          // primary Kiro client). See openai-to-kiro.ts convertMessages()/buildKiroPayload() for
          // where the system text is now consumed exactly once.

          // Log OpenAI intermediate format
          reqLogger?.logOpenAIRequest?.(result);
        }
      }

      // Step 2: openai -> target (if target is not openai)
      if (targetFormat !== FORMATS.OPENAI) {
        const fromOpenAI = getRequestTranslator(FORMATS.OPENAI, targetFormat);
        if (fromOpenAI) {
          result = fromOpenAI(model, result, stream, credentials);
        }
      }
    }
  }

  // Always normalize to clean OpenAI format when target is OpenAI
  // This handles hybrid requests (e.g., OpenAI messages + Claude tools)
  if (targetFormat === FORMATS.OPENAI) {
    // `quirks.preserveCacheControl` is an opt-in registry flag (e.g. alicode/
    // alicode-intl for DashScope prompt caching). Absent by default, meaning
    // cache_control is stripped exactly as before for every other provider.
    const registryEntry = provider ? getRegistryEntry(String(provider)) : null;
    const preserveCacheControl = registryEntry?.quirks?.preserveCacheControl === true;
    result = filterToOpenAIFormat(result, { preserveCacheControl });
  }

  // Final step: prepare request for Claude format endpoints
  // Preserve cache_control when:
  // 1. Claude passthrough mode (Claude → Claude), OR
  // 2. Explicitly requested via options (for caching-aware clients like Claude Code)
  if (targetFormat === FORMATS.CLAUDE) {
    const isClaudePassthrough = sourceFormat === FORMATS.CLAUDE;
    const preserveCache = isClaudePassthrough || options?.preserveCacheControl === true;
    result = prepareClaudeRequest(result, provider, preserveCache);
  }

  // Normalize openai-responses input shape for providers that require list input.
  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    result = normalizeOpenAIResponsesRequest(result);
  }

  // Second role normalization: only for OPENAI_RESPONSES. Here messages are built from input
  // after the translation step, so the first normalizeRoles (above) did not see them. For
  // sourceFormat openai with messages already on the body, the first block handles developer
  // → system (non-openai target or preserveDeveloperRole=false); no second pass needed.
  if (
    sourceFormat === FORMATS.OPENAI_RESPONSES &&
    result.messages &&
    Array.isArray(result.messages)
  ) {
    result.messages = normalizeRoles(
      result.messages,
      provider || "",
      model || "",
      targetFormat,
      preserveDeveloperRole
    );
  }

  if (result.tools !== undefined) {
    result.tools = coerceToolSchemas(result.tools);
    result.tools = sanitizeToolDescriptions(result.tools);
  }

  if (targetFormat === FORMATS.OPENAI && result.messages && Array.isArray(result.messages)) {
    const replayEnabled = requiresReasoningReplay(String(provider || ""), String(model || ""));
    if (replayEnabled) {
      for (const msg of result.messages) {
        if (
          msg?.role === "assistant" &&
          Array.isArray(msg.tool_calls) &&
          msg.tool_calls.length > 0 &&
          (msg.reasoning_content === undefined || msg.reasoning_content === "")
        ) {
          const toolCallId = msg.tool_calls?.[0]?.id;
          if (typeof toolCallId === "string" && toolCallId.length > 0) {
            const cachedReasoning = lookupReasoning(
              toolCallId,
              String(provider || ""),
              String(model || "")
            );
            if (cachedReasoning) {
              msg.reasoning_content = cachedReasoning;
            }
          }
        }
      }
    }
    result.messages = injectEmptyReasoningContentForToolCalls(result.messages, provider, model);
  }

  // Ensure unique tool_call ids on final payload (translators may have introduced duplicates)
  ensureToolCallIds(result, { use9CharId });
  fixMissingToolResponses(result);

  // Coerce known tool arguments that must be arrays (e.g. submit_pr_review functionalChanges/findings)
  if (result.messages && Array.isArray(result.messages)) {
    for (const msg of result.messages) {
      if (msg?.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc?.function?.name && typeof tc.function.arguments === "string") {
            try {
              const parsed = JSON.parse(tc.function.arguments);
              const coerced = coerceToolCallArguments(tc.function.name, parsed);
              if (coerced !== parsed) {
                tc.function.arguments = JSON.stringify(coerced);
              }
            } catch {
              // leave arguments as-is if not valid JSON
            }
          }
        }
      }
    }
  }

  if (result.tools) {
    result.tools = coerceToolSchemas(result.tools);
    result.tools = sanitizeToolDescriptions(result.tools);
  }

  if (isReasoner(provider, model) && result.messages && Array.isArray(result.messages)) {
    result.messages = injectEmptyReasoningContent(result.messages);
  }

  return result;
}

// Translate response chunk: target -> openai -> source
export function translateResponse(targetFormat, sourceFormat, chunk, state) {
  // If same format, return as-is
  if (sourceFormat === targetFormat) {
    return [chunk];
  }

  let results = [chunk];
  let openaiResults = null; // Store OpenAI intermediate results

  // Check for direct translation path first (e.g., Gemini → Claude)
  const directTranslator = getResponseTranslator(targetFormat, sourceFormat);
  if (directTranslator && targetFormat !== FORMATS.OPENAI && sourceFormat !== FORMATS.OPENAI) {
    const converted = directTranslator(chunk, state);
    if (converted) {
      results = Array.isArray(converted) ? converted : [converted];
    } else {
      results = [];
    }
    return results;
  }

  // Fallback: hub-and-spoke via OpenAI
  // Step 1: target -> openai (if target is not openai)
  if (targetFormat !== FORMATS.OPENAI) {
    const toOpenAI = getResponseTranslator(targetFormat, FORMATS.OPENAI);
    if (toOpenAI) {
      results = [];
      const converted = toOpenAI(chunk, state);
      if (converted) {
        results = Array.isArray(converted) ? converted : [converted];
        openaiResults = results; // Store OpenAI intermediate
      }
    }
  }

  // Step 2: openai -> source (if source is not openai)
  if (sourceFormat !== FORMATS.OPENAI) {
    const fromOpenAI = getResponseTranslator(FORMATS.OPENAI, sourceFormat);
    if (fromOpenAI) {
      const finalResults = [];
      for (const r of results) {
        const converted = fromOpenAI(r, state);
        if (converted) {
          finalResults.push(...(Array.isArray(converted) ? converted : [converted]));
        }
      }
      // Flush: pass null to source-format translator even when Step 1 produced no output.
      // This is critical for formats like openai-responses that emit terminal events
      // (e.g., response.completed with total_tokens) in their flush handler.
      if (chunk === null && results.length === 0) {
        const converted = fromOpenAI(null, state);
        if (converted) {
          finalResults.push(...(Array.isArray(converted) ? converted : [converted]));
        }
      }
      results = finalResults;
    }
  }

  // Attach OpenAI intermediate results for logging
  if (openaiResults && sourceFormat !== FORMATS.OPENAI && targetFormat !== FORMATS.OPENAI) {
    (results as { _openaiIntermediate?: unknown })._openaiIntermediate = openaiResults;
  }

  return results;
}

// Check if translation needed
export function needsTranslation(sourceFormat, targetFormat) {
  return sourceFormat !== targetFormat;
}

// Initialize state for streaming response based on format
export function initState(sourceFormat) {
  // Base state for all formats
  const base = {
    messageId: null,
    model: null,
    textBlockStarted: false,
    thinkingBlockStarted: false,
    inThinkingBlock: false,
    currentBlockIndex: null,
    toolCalls: new Map(),
    finishReason: null,
    finishReasonSent: false,
    usage: null,
    contentBlockIndex: -1,
  };

  // Add openai-responses specific fields
  if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
    return {
      ...base,
      seq: 0,
      responseId: `resp_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      started: false,
      msgTextBuf: {},
      msgItemAdded: {},
      msgContentAdded: {},
      msgItemDone: {},
      reasoningId: "",
      reasoningIndex: -1,
      reasoningBuf: "",
      reasoningPartAdded: false,
      reasoningDone: false,
      inThinking: false,
      funcArgsBuf: {},
      funcNames: {},
      funcCallIds: {},
      funcArgsDone: {},
      funcItemDone: {},
      completedSent: false,
    };
  }

  return base;
}

// Initialize all translators (no-op, kept for backward compatibility)
export function initTranslators() {
  bootstrapTranslatorRegistry();
}
