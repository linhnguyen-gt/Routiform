import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { toNumber, toRecord, toString, resolveToolName } from "./shared.ts";
import type { JsonRecord } from "./shared.ts";

function extractMessageOutputText(item: JsonRecord): string {
  if (!Array.isArray(item.content)) return "";
  let text = "";
  for (const part of item.content) {
    if (!part || typeof part !== "object") continue;
    const partObj = toRecord(part);
    if (partObj.type === "output_text" && typeof partObj.text === "string") {
      text += partObj.text;
    }
  }
  return text;
}

/**
 * T19: Pick the last non-empty message output text from Responses API output.
 * Falls back to the last message item even when all message texts are empty.
 */
function findBestMessageText(output: unknown[]): {
  text: string;
  selectedMessageIndex: number;
  messageItems: JsonRecord[];
} {
  const messageItems = output
    .map((item) => toRecord(item))
    .filter((item) => item.type === "message" && Array.isArray(item.content));

  for (let i = messageItems.length - 1; i >= 0; i -= 1) {
    const text = extractMessageOutputText(messageItems[i]);
    if (text.trim().length > 0) {
      return { text, selectedMessageIndex: i, messageItems };
    }
  }

  if (messageItems.length > 0) {
    const lastIndex = messageItems.length - 1;
    return {
      text: extractMessageOutputText(messageItems[lastIndex]),
      selectedMessageIndex: lastIndex,
      messageItems,
    };
  }

  return { text: "", selectedMessageIndex: -1, messageItems: [] };
}

/**
 * Translate an OpenAI Responses API payload into an OpenAI chat.completion payload.
 * Exported for the dispatcher in ../responseTranslator.ts.
 */
export function translateResponsesToOpenAI(
  responseBody: unknown,
  toolNameMap?: Map<string, string> | null
): unknown {
  const responseRoot = toRecord(responseBody);
  const response =
    responseRoot.object === "response"
      ? responseRoot
      : toRecord(responseRoot.response ?? responseRoot);
  const output = Array.isArray(response.output) ? response.output : [];
  const usage = toRecord(response.usage ?? responseRoot.usage);

  const messageSelection = findBestMessageText(output);
  let textContent = messageSelection.text;
  let reasoningContent = "";
  const toolCalls: JsonRecord[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemObj = toRecord(item);

    if (itemObj.type === "message" && Array.isArray(itemObj.content)) {
      // Scan message content parts for any reasoning summary text that may be embedded
      // inside a message item (some providers put summary_text in message.content).
      for (const part of itemObj.content) {
        if (!part || typeof part !== "object") continue;
        const partObj = toRecord(part);
        if (partObj.type === "summary_text" && typeof partObj.text === "string") {
          reasoningContent += partObj.text;
        }
        // Also pick up refusal content if present
        if (partObj.type === "refusal" && typeof partObj.refusal === "string") {
          // Map refusal to text content so clients receive it
          if (!textContent) {
            textContent = partObj.refusal;
          }
        }
      }
    } else if (itemObj.type === "reasoning" && Array.isArray(itemObj.summary)) {
      // Top-level reasoning output item — collect all summary text parts in order.
      for (const part of itemObj.summary) {
        const partObj = toRecord(part);
        if (partObj.type === "summary_text" && typeof partObj.text === "string") {
          reasoningContent += partObj.text;
        }
      }
    } else if (itemObj.type === "function_call") {
      const fnArgs =
        typeof itemObj.arguments === "string"
          ? itemObj.arguments
          : JSON.stringify(itemObj.arguments || {});
      const callId =
        toString(itemObj.call_id) ||
        toString(itemObj.id) ||
        generateToolCallId({
          source: "responses-json-message",
          index: toolCalls.length,
          name: itemObj.name,
          arguments: fnArgs,
        });
      const rawName = toString(itemObj.name);
      // Strip Claude OAuth proxy_ prefix using toolNameMap
      const resolvedName = resolveToolName(rawName, toolNameMap);
      toolCalls.push({
        id: callId,
        type: "function",
        function: {
          name: resolvedName,
          arguments: fnArgs,
        },
      });
    } else if (itemObj.type === "web_search_call" || itemObj.type === "web_search_result") {
      // Built-in tool output items: not representable as Chat tool_calls.
      // Skip them rather than dropping them silently — they have no Chat equivalent.
      if (process.env.DEBUG_RESPONSES_EVENTS === "true") {
        console.log(`[responseTranslator] skipping built-in output item type: ${itemObj.type}`);
      }
    }
    // Other unknown output item types are intentionally skipped; the caller receives
    // whatever text/reasoning/tool_calls we could extract rather than an error.
  }

  const message: JsonRecord = { role: "assistant" };
  if (textContent) {
    message.content = textContent;
  }
  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  if (message.content === undefined) {
    message.content = "";
  }

  if (process.env.DEBUG_RESPONSES_SSE_TO_JSON === "true") {
    console.log(
      `[ResponsesSSE] ${output.length} output items, ${messageSelection.messageItems.length} message items`
    );
    messageSelection.messageItems.forEach((item, idx) => {
      const textLen = extractMessageOutputText(item).length;
      console.log(`  [${idx}] text length: ${textLen}`);
    });
    console.log(`  → Selected message index: ${messageSelection.selectedMessageIndex}`);
    console.log(`  → Final text content length: ${textContent.length}`);
  }

  const createdAt = toNumber(response.created_at, Math.floor(Date.now() / 1000));
  const model = toString(response.model || responseRoot.model, "openai-responses");
  const finishReason = toolCalls.length > 0 ? "tool_calls" : "stop";

  const result: JsonRecord = {
    id: `chatcmpl-${toString(response.id, String(Date.now()))}`,
    object: "chat.completion",
    created: createdAt,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };

  if (Object.keys(usage).length > 0) {
    const inputTokens = toNumber(usage.input_tokens, 0);
    const outputTokens = toNumber(usage.output_tokens, 0);
    result.usage = {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };

    if (toNumber(usage.reasoning_tokens, 0) > 0) {
      (result.usage as JsonRecord).completion_tokens_details = {
        reasoning_tokens: toNumber(usage.reasoning_tokens, 0),
      };
    }
    if (
      toNumber(usage.cache_read_input_tokens, 0) > 0 ||
      toNumber(usage.cache_creation_input_tokens, 0) > 0
    ) {
      (result.usage as JsonRecord).prompt_tokens_details = {};
      const promptDetails = (result.usage as JsonRecord).prompt_tokens_details as JsonRecord;
      if (toNumber(usage.cache_read_input_tokens, 0) > 0) {
        promptDetails.cached_tokens = toNumber(usage.cache_read_input_tokens, 0);
      }
      if (toNumber(usage.cache_creation_input_tokens, 0) > 0) {
        promptDetails.cache_creation_tokens = toNumber(usage.cache_creation_input_tokens, 0);
      }
    }
  }

  return result;
}
