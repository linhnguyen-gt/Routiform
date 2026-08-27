import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { toNumber, toRecord, toString } from "./shared.ts";
import type { JsonRecord } from "./shared.ts";

/**
 * Translate a Gemini/Antigravity payload into an OpenAI chat.completion payload.
 * Returns null when no candidates are present (caller keeps the raw response).
 */
export function translateGeminiToOpenAI(responseBody: unknown): JsonRecord | null {
  const root = toRecord(responseBody);
  const response = toRecord(root.response ?? root);
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  if (!candidates[0]) {
    return null;
  }

  const candidate = toRecord(candidates[0]);
  const content = toRecord(candidate.content);
  const usage = toRecord(response.usageMetadata ?? root.usageMetadata);

  let textContent = "";
  const toolCalls: JsonRecord[] = [];
  let reasoningContent = "";

  if (Array.isArray(content.parts)) {
    for (const part of content.parts) {
      const partObj = toRecord(part);
      if (partObj.thought === true && typeof partObj.text === "string") {
        reasoningContent += partObj.text;
      } else if (typeof partObj.text === "string") {
        textContent += partObj.text;
      }
      if (partObj.functionCall) {
        const fn = toRecord(partObj.functionCall);
        const fnName = toString(fn.name);
        const fnArguments = JSON.stringify(fn.args || {});
        toolCalls.push({
          id: generateToolCallId({
            source: "response-translator-candidate-part",
            index: toolCalls.length,
            name: fnName,
            arguments: fnArguments,
          }),
          type: "function",
          function: {
            name: fnName,
            arguments: fnArguments,
          },
        });
      }
    }
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
  if (!message.content && !message.tool_calls) {
    message.content = "";
  }

  let finishReason = toString(candidate.finishReason, "stop").toLowerCase();
  if (finishReason === "stop" && toolCalls.length > 0) {
    finishReason = "tool_calls";
  }

  const createdMs = Date.parse(toString(response.createTime));
  const created = Number.isFinite(createdMs)
    ? Math.floor(createdMs / 1000)
    : Math.floor(Date.now() / 1000);

  const result: JsonRecord = {
    id: `chatcmpl-${toString(response.responseId, String(Date.now()))}`,
    object: "chat.completion",
    created,
    model: toString(response.modelVersion, "gemini"),
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };

  if (Object.keys(usage).length > 0) {
    result.usage = {
      prompt_tokens: toNumber(usage.promptTokenCount, 0) + toNumber(usage.thoughtsTokenCount, 0),
      completion_tokens: toNumber(usage.candidatesTokenCount, 0),
      total_tokens: toNumber(usage.totalTokenCount, 0),
    };
    if (toNumber(usage.thoughtsTokenCount, 0) > 0) {
      (result.usage as JsonRecord).completion_tokens_details = {
        reasoning_tokens: toNumber(usage.thoughtsTokenCount, 0),
      };
    }
  }

  return result;
}
