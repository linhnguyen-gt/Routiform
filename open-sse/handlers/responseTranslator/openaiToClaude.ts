import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { toNumber, toRecord, toString, tryParseJsonString } from "./shared.ts";
import type { JsonRecord } from "./shared.ts";

export function toClaudeContentBlocksFromOpenAIMessage(messageObj: JsonRecord): JsonRecord[] {
  const content: JsonRecord[] = [];
  const rawContent = messageObj.content;

  if (messageObj.reasoning_content) {
    content.push({
      type: "thinking",
      thinking: toString(messageObj.reasoning_content),
    });
  }

  if (Array.isArray(rawContent)) {
    for (const part of rawContent) {
      const partObj = toRecord(part);
      const partType = toString(partObj.type);
      if (!partType) continue;
      if (
        partType === "text" ||
        partType === "thinking" ||
        partType === "redacted_thinking" ||
        partType === "tool_use" ||
        partType === "server_tool_use" ||
        partType === "web_search_tool_result" ||
        partType === "web_fetch_tool_result"
      ) {
        content.push(JSON.parse(JSON.stringify(partObj)));
        continue;
      }
      const textValue = toString(partObj.text || partObj.content);
      if (textValue) {
        content.push({
          type: "text",
          text: textValue,
          ...(Array.isArray(partObj.citations) ? { citations: partObj.citations } : {}),
        });
      }
    }
  } else if (rawContent !== undefined && rawContent !== null) {
    content.push({
      type: "text",
      text: toString(rawContent),
    });
  }

  if (Array.isArray(messageObj.tool_calls)) {
    for (const tool of messageObj.tool_calls) {
      const toolObj = toRecord(tool);
      const fn = toRecord(toolObj.function);
      content.push({
        type: "tool_use",
        id:
          toString(toolObj.id) ||
          generateToolCallId({
            source: "openai-to-claude-response",
            index: content.length,
            name: fn.name,
            arguments: fn.arguments || {},
          }),
        name: toString(fn.name),
        input:
          typeof fn.arguments === "string"
            ? tryParseJsonString(fn.arguments || "{}")
            : fn.arguments || {},
      });
    }
  }

  if (content.length === 0) {
    content.push({
      type: "text",
      text: "",
    });
  }

  return content;
}

/**
 * Helper to convert an OpenAI chat.completion JSON object to Claude format for non-streaming.
 */
export function convertOpenAINonStreamingToClaude(openaiResponse: JsonRecord): JsonRecord {
  const choices = openaiResponse.choices as unknown[] | undefined;
  const isChoicesArray = Array.isArray(choices);
  if (!isChoicesArray && openaiResponse.object !== "chat.completion") {
    return openaiResponse; // If it doesn't look like OpenAI, return as-is
  }

  const choice = isChoicesArray ? choices[0] : null;
  const choiceObj = choice ? toRecord(choice) : {};
  const messageObj = choiceObj.message ? toRecord(choiceObj.message) : {};
  const content = toClaudeContentBlocksFromOpenAIMessage(messageObj);
  let stopReason = toString(choiceObj.finish_reason, "end_turn");
  if (stopReason === "stop") stopReason = "end_turn";
  if (stopReason === "tool_calls") stopReason = "tool_use";

  const usageSrc = toRecord(openaiResponse.usage);
  const claudeResponse: JsonRecord = {
    id: toString(openaiResponse.id, `msg_${Date.now()}`),
    type: "message",
    role: "assistant",
    model: toString(openaiResponse.model, "claude"),
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: toNumber(usageSrc.prompt_tokens, 0),
      output_tokens: toNumber(usageSrc.completion_tokens, 0),
    },
  };

  return claudeResponse;
}
