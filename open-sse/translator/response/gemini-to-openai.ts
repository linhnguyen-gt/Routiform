import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { storeGeminiThoughtSignature } from "../../services/geminiThoughtSignatureStore.ts";
import { logger } from "../../utils/logger.ts";

const log = logger("TRANSLATOR");

// Gemini finishReason (lowercased) -> OpenAI finish_reason enum
// (stop | length | tool_calls | content_filter | function_call).
// Anything outside the enum makes a conforming client treat a truncated
// completion as a normal stop, so every documented Gemini value is mapped.
const GEMINI_FINISH_REASON: Record<string, string> = {
  stop: "stop",
  max_tokens: "length",
  safety: "content_filter",
  recitation: "content_filter",
  blocklist: "content_filter",
  prohibited_content: "content_filter",
  spii: "content_filter",
  malformed_function_call: "tool_calls",
  other: "stop",
  finish_reason_unspecified: "stop",
};

// Push one assistant delta chunk in this stream's envelope shape.
function pushDeltaChunk(state, results, delta) {
  results.push({
    id: `chatcmpl-${state.messageId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: null }],
  });
}

// Build an OpenAI tool_call from a Gemini functionCall part, persist any pending
// thought signature onto it, and register it in state. Shared by the
// thinking-signature branch and the plain branch below.
function buildGeminiToolCall(state, functionCall) {
  const fcName = functionCall.name;
  const fcArgs = functionCall.args || {};
  const toolCallIndex = state.functionIndex++;

  const toolCall = {
    id: `${fcName}-${Date.now()}-${toolCallIndex}`,
    index: toolCallIndex,
    type: "function",
    function: {
      name: fcName,
      arguments: JSON.stringify(fcArgs),
    },
  };

  if (state.pendingThoughtSignature) {
    storeGeminiThoughtSignature(toolCall.id, state.pendingThoughtSignature);
    state.pendingThoughtSignature = null;
  }

  state.toolCalls.set(toolCallIndex, toolCall);
  return toolCall;
}

// Convert Gemini response chunk to OpenAI format
export function geminiToOpenAIResponse(chunk, state) {
  if (!chunk) return null;

  // Handle Antigravity wrapper
  const response = chunk.response || chunk;
  if (!response || !response.candidates?.[0]) return null;

  const results = [];
  const candidate = response.candidates[0];
  const content = candidate.content;

  // Initialize state
  if (!state.messageId) {
    state.messageId = response.responseId || `msg_${Date.now()}`;
    state.model = response.modelVersion || "gemini";
    state.functionIndex = 0;
    results.push({
      id: `chatcmpl-${state.messageId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: state.model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    });
  }

  // Process parts
  if (content?.parts) {
    for (const part of content.parts) {
      const hasThoughtSig = part.thoughtSignature || part.thought_signature;
      const isThought = part.thought === true;
      if (hasThoughtSig && typeof hasThoughtSig === "string") {
        state.pendingThoughtSignature = hasThoughtSig;
      }

      // Handle thought signature (thinking mode)
      if (hasThoughtSig) {
        const hasTextContent = part.text !== undefined && part.text !== "";
        const hasFunctionCall = !!part.functionCall;

        if (hasTextContent) {
          pushDeltaChunk(
            state,
            results,
            isThought ? { reasoning_content: part.text } : { content: part.text }
          );
        }

        if (hasFunctionCall) {
          const toolCall = buildGeminiToolCall(state, part.functionCall);
          pushDeltaChunk(state, results, { tool_calls: [toolCall] });
        }
        continue;
      }

      // Text content (non-thinking)
      if (part.text !== undefined && part.text !== "") {
        pushDeltaChunk(state, results, { content: part.text });
      }

      // Function call
      if (part.functionCall) {
        const toolCall = buildGeminiToolCall(state, part.functionCall);
        pushDeltaChunk(state, results, { tool_calls: [toolCall] });
      }

      // Inline data (images)
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
        pushDeltaChunk(state, results, {
          images: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${inlineData.data}` },
            },
          ],
        });
      }
    }
  }

  // Usage metadata - extract before finish reason so we can include it
  const usageMeta = response.usageMetadata || chunk.usageMetadata;
  if (usageMeta && typeof usageMeta === "object") {
    const cachedTokens =
      typeof usageMeta.cachedContentTokenCount === "number" ? usageMeta.cachedContentTokenCount : 0;
    const promptTokenCountRaw =
      typeof usageMeta.promptTokenCount === "number" ? usageMeta.promptTokenCount : 0;
    const thoughtsTokens =
      typeof usageMeta.thoughtsTokenCount === "number" ? usageMeta.thoughtsTokenCount : 0;
    let candidatesTokens =
      typeof usageMeta.candidatesTokenCount === "number" ? usageMeta.candidatesTokenCount : 0;
    const totalTokens =
      typeof usageMeta.totalTokenCount === "number" ? usageMeta.totalTokenCount : 0;

    // prompt_tokens = promptTokenCount (includes cached tokens, matching claude-to-openai.js behavior)
    const promptTokens = promptTokenCountRaw;

    // Fallback calculation if candidatesTokenCount is 0 but totalTokenCount exists
    if (candidatesTokens === 0 && totalTokens > 0) {
      candidatesTokens = totalTokens - promptTokenCountRaw - thoughtsTokens;
      if (candidatesTokens < 0) candidatesTokens = 0;
    }

    // completion_tokens = candidatesTokenCount + thoughtsTokenCount (match Go code)
    const completionTokens = candidatesTokens + thoughtsTokens;

    state.usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    };

    // Add prompt_tokens_details if cached tokens exist
    if (cachedTokens > 0) {
      state.usage.prompt_tokens_details = {
        cached_tokens: cachedTokens,
      };
    }

    // Add completion_tokens_details if reasoning tokens exist
    if (thoughtsTokens > 0) {
      state.usage.completion_tokens_details = {
        reasoning_tokens: thoughtsTokens,
      };
    }
  }

  // Finish reason - include usage in final chunk
  if (candidate.finishReason) {
    const rawFinishReason = candidate.finishReason.toLowerCase();
    let finishReason;
    if (rawFinishReason === "stop" && state.toolCalls.size > 0) {
      // Tool-call promotion wins over the plain "stop" mapping.
      finishReason = "tool_calls";
    } else {
      finishReason = GEMINI_FINISH_REASON[rawFinishReason];
      if (!finishReason) {
        log.warn(`Unmapped Gemini finishReason "${candidate.finishReason}", defaulting to "stop"`);
        finishReason = "stop";
      }
    }

    const finalChunk: Record<string, unknown> = {
      id: `chatcmpl-${state.messageId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: state.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finishReason,
        },
      ],
    };

    // Include usage in final chunk for downstream translators
    if (state.usage) {
      finalChunk.usage = state.usage;
    }

    results.push(finalChunk);
    state.finishReason = finishReason;
  }

  return results.length > 0 ? results : null;
}

// Register
register(FORMATS.GEMINI, FORMATS.OPENAI, null, geminiToOpenAIResponse);
register(FORMATS.ANTIGRAVITY, FORMATS.OPENAI, null, geminiToOpenAIResponse);
