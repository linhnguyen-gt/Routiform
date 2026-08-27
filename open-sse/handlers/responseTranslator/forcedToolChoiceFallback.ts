import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { toRecord, toString } from "./shared.ts";

/**
 * Apply forced tool_choice fallback when upstream ignores tool_choice and returns JSON as plain text.
 *
 * Codex upstream sometimes ignores `tool_choice: {type:"function", function:{name:"..."}}`,
 * returning `choices[0].message.content = '{"path":"/Users/..."}'` (plain text JSON)
 * with `finish_reason = "stop"` instead of `"tool_calls"`.
 *
 * This function synthesizes tool_calls from the JSON content when all conditions are met:
 * - finish_reason === "stop" (not already "tool_calls")
 * - No existing tool_calls
 * - tool_choice is forced (single function or "required")
 * - content is valid JSON
 *
 * @param requestBody - Original request with tool_choice and tools
 * @param responseBody - Translated response (OpenAI format)
 * @returns Modified response with synthesized tool_calls, or original if conditions not met
 */
export function applyForcedToolChoiceFallback(
  requestBody: unknown,
  responseBody: unknown
): unknown {
  const req = toRecord(requestBody);
  const res = toRecord(responseBody);
  const choices = Array.isArray(res.choices) ? res.choices : [];
  if (!choices[0]) return responseBody;

  const choice = toRecord(choices[0]);
  const message = toRecord(choice.message);

  // Guard: only when no tool_calls and stop finish
  if (choice.finish_reason !== "stop") return responseBody;
  const existingCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (existingCalls.length > 0) return responseBody;

  // Guard: tool_choice must be forced single function
  const toolChoice = req.tool_choice;
  let forcedName: string | null = null;
  if (toolChoice && typeof toolChoice === "object") {
    const tc = toRecord(toolChoice);
    if (tc.type === "function") {
      const fn = toRecord(tc.function);
      forcedName = toString(fn.name) || null;
    }
  }
  // "required" + first tool name
  // Note: When tool_choice="required" with multiple tools, we assume the first tool
  // since the upstream returned JSON without indicating which tool was intended
  if (toolChoice === "required") {
    const tools = Array.isArray(req.tools) ? req.tools : [];
    if (tools.length === 0) return responseBody; // No tools to synthesize
    const firstTool = toRecord(tools[0]);
    const firstToolFunc = toRecord(firstTool.function);
    forcedName = toString(firstToolFunc.name) || null;
  }
  if (!forcedName) return responseBody;

  // Guard: content must be valid JSON
  const content = toString(message.content);
  if (!content) return responseBody;
  try {
    JSON.parse(content);
  } catch {
    return responseBody;
  }

  // Synthesize tool_calls
  const callId = generateToolCallId({
    source: "forced-tool-choice-fallback",
    index: 0,
    name: forcedName,
    arguments: content,
  });
  const newChoice = {
    ...choice,
    finish_reason: "tool_calls",
    message: {
      ...message,
      content: "",
      tool_calls: [
        {
          id: callId,
          type: "function",
          function: {
            name: forcedName,
            arguments: content,
          },
        },
      ],
    },
  };
  return { ...res, choices: [newChoice] };
}
