import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { toNumber, toRecord, toString, resolveToolName } from "./shared.ts";
import type { JsonRecord } from "./shared.ts";

/**
 * Translate a Claude payload into an OpenAI chat.completion payload.
 * Returns null when no content blocks are present (caller keeps the raw response).
 */
export function translateClaudeToOpenAI(
  responseBody: unknown,
  toolNameMap?: Map<string, string> | null
): JsonRecord | null {
  const root = toRecord(responseBody);
  const contentBlocks = Array.isArray(root.content) ? root.content : [];
  if (contentBlocks.length === 0) {
    return null;
  }

  let textContent = "";
  let thinkingContent = "";
  const toolCalls: JsonRecord[] = [];
  const richClaudeBlocks: JsonRecord[] = [];

  for (const block of contentBlocks) {
    const blockObj = toRecord(block);
    if (blockObj.type === "text") {
      textContent += toString(blockObj.text);
    } else if (blockObj.type === "thinking") {
      thinkingContent += toString(blockObj.thinking);
    } else if (blockObj.type === "tool_use" || blockObj.type === "server_tool_use") {
      const rawName = toString(blockObj.name);
      const strippedName = resolveToolName(rawName, toolNameMap);
      toolCalls.push({
        id:
          toString(blockObj.id) ||
          generateToolCallId({
            source: "claude-message-content",
            index: toolCalls.length,
            name: strippedName,
            arguments: blockObj.input || {},
          }),
        type: "function",
        function: {
          name: strippedName,
          arguments: JSON.stringify(blockObj.input || {}),
        },
      });
    } else {
      richClaudeBlocks.push(JSON.parse(JSON.stringify(blockObj)));
    }
  }

  const message: JsonRecord = { role: "assistant" };
  if (textContent) {
    message.content = textContent;
  }
  if (thinkingContent) {
    message.reasoning_content = thinkingContent;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  if (message.content === undefined) {
    message.content = "";
  }
  if (richClaudeBlocks.length > 0) {
    message.content_blocks = richClaudeBlocks;
  }

  let finishReason = toString(root.stop_reason, "stop");
  if (finishReason === "end_turn") finishReason = "stop";
  if (finishReason === "tool_use") finishReason = "tool_calls";

  const result: JsonRecord = {
    id: `chatcmpl-${toString(root.id, String(Date.now()))}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: toString(root.model, "claude"),
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };

  const usage = toRecord(root.usage);
  if (Object.keys(usage).length > 0) {
    const promptTokens = toNumber(usage.input_tokens, 0);
    const completionTokens = toNumber(usage.output_tokens, 0);
    result.usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }

  return result;
}
