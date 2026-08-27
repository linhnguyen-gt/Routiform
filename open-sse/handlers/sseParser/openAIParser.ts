import { normalizePlaceholderOnlyAssistantText } from "../../utils/assistantContent.ts";
import { appendTextPart, collapseExactDuplicateMessage } from "./textAccumulator.ts";
import { appendFromOpenAIDeltaContent } from "./openAIDelta.ts";
import { collectOpenAIChatCompletionChunks } from "./sseEvents.ts";
import { toRecord } from "./shared.ts";

export function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const chunks = collectOpenAIChatCompletionChunks(rawSSE);

  if (chunks.length === 0) return null;

  const first = chunks[0];
  const contentParts = [];
  const fallbackMessageParts = [];
  const reasoningParts = [];
  type AccumulatedToolCall = {
    id: string | null;
    index: number;
    type: string;
    function: { name: string; arguments: string };
  };

  const accumulatedToolCalls = new Map<string, AccumulatedToolCall>();
  let unknownToolCallSeq = 0;
  let finishReason = "stop";
  let usage = null;

  const getToolCallKey = (toolCall: Record<string, unknown>) => {
    if (Number.isInteger(toolCall?.index)) return `idx:${toolCall.index}`;
    if (toolCall?.id) return `id:${toolCall.id}`;
    unknownToolCallSeq += 1;
    return `seq:${unknownToolCallSeq}`;
  };

  for (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};

    // Some gateways send a final chunk with `message` instead of/in addition to `delta`.
    const fullMessage = choice?.message;
    if (fullMessage && typeof fullMessage === "object") {
      const fm = toRecord(fullMessage);
      if (typeof fm.content === "string" && fm.content.length > 0) {
        appendTextPart(fallbackMessageParts, fm.content);
      }
      if (typeof fm.refusal === "string" && fm.refusal.length > 0) {
        appendTextPart(fallbackMessageParts, fm.refusal);
      }
    }

    appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts);

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      appendTextPart(reasoningParts, delta.reasoning_content);
    }
    // Normalize `reasoning` alias (NVIDIA kimi-k2.5 etc.)
    if (
      typeof delta.reasoning === "string" &&
      delta.reasoning.length > 0 &&
      !delta.reasoning_content
    ) {
      appendTextPart(reasoningParts, delta.reasoning);
    }
    if (typeof delta.thinking === "string" && delta.thinking.length > 0) {
      appendTextPart(reasoningParts, delta.thinking);
    }

    // T18: Accumulate tool calls correctly across streamed chunks
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const key = getToolCallKey(tc);
        const existing = accumulatedToolCalls.get(key);
        const deltaArgs = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";

        if (!existing) {
          accumulatedToolCalls.set(key, {
            id: tc?.id ?? null,
            index: Number.isInteger(tc?.index) ? tc.index : accumulatedToolCalls.size,
            type: tc?.type || "function",
            function: {
              name: tc?.function?.name || "unknown",
              arguments: deltaArgs,
            },
          });
        } else {
          existing.id = existing.id || tc?.id || null;
          if (!Number.isInteger(existing.index) && Number.isInteger(tc?.index)) {
            existing.index = tc.index;
          }
          if (tc?.function?.name && !existing.function?.name) {
            existing.function.name = tc.function.name;
          }
          existing.function.arguments = `${existing.function.arguments || ""}${deltaArgs}`;
          accumulatedToolCalls.set(key, existing);
        }
      }
    }

    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (chunk?.usage && typeof chunk.usage === "object") {
      usage = chunk.usage;
    }
  }

  const selectedContentParts = contentParts.length > 0 ? contentParts : fallbackMessageParts;
  const joinedContentRaw =
    selectedContentParts.length > 0
      ? collapseExactDuplicateMessage(selectedContentParts.join("").trim())
      : "";
  const joinedContent = normalizePlaceholderOnlyAssistantText(joinedContentRaw);
  const joinedReasoning =
    reasoningParts.length > 0
      ? collapseExactDuplicateMessage(reasoningParts.join("").trim())
      : null;
  const message: Record<string, unknown> = {
    role: "assistant",
    content: joinedContent,
  };
  if (joinedReasoning) {
    message.reasoning_content = joinedReasoning;
  }

  const finalToolCalls = [...accumulatedToolCalls.values()].filter(Boolean).sort((a, b) => {
    const ai = Number.isInteger(a?.index) ? a.index : 0;
    const bi = Number.isInteger(b?.index) ? b.index : 0;
    return ai - bi;
  });
  if (finalToolCalls.length > 0) {
    finishReason = "tool_calls"; // T18 normalization
    message.tool_calls = finalToolCalls;
  }

  const result: Record<string, unknown> = {
    id: first.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first.created || Math.floor(Date.now() / 1000),
    model: first.model || fallbackModel || "unknown",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };

  if (usage) {
    result.usage = usage;
  }

  return result;
}
