/**
 * OpenAI to Cursor Request Translator
 * Converts OpenAI messages to Cursor ask/agent format.
 *
 * Important: Cursor can loop when tool outputs are sent via protobuf tool_results
 * with partial schema mismatches. For stability, tool outputs are represented as
 * structured text blocks in user messages.
 */
import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";

type TextPart = { type?: string; text?: string };
type ToolUsePart = { type?: string; id?: string; name?: string; input?: unknown };
type ToolResultPart = { type?: string; tool_use_id?: string; content?: unknown };

function normalizeToolCallId(id: unknown): string {
  return typeof id === "string" ? id.split("\n")[0] : "";
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is TextPart => {
        if (!part || typeof part !== "object") return false;
        const maybe = part as TextPart;
        return maybe.type === "text" && typeof maybe.text === "string";
      })
      .map((part) => part.text as string)
      .join("");
  }
  return "";
}

function sanitizeToolResultText(text: string): string {
  // Strip non-printable control chars that can produce backend request errors.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildToolResultBlock(toolName: string, toolCallId: string, resultText: string): string {
  const cleanResult = sanitizeToolResultText(resultText || "");
  return [
    "<tool_result>",
    `<tool_name>${escapeXml(toolName || "tool")}</tool_name>`,
    `<tool_call_id>${escapeXml(toolCallId || "")}</tool_call_id>`,
    `<result>${escapeXml(cleanResult)}</result>`,
    "</tool_result>",
  ].join("\n");
}

function convertMessages(messages) {
  const result = [];
  // Build a map of tool_call_id -> tool name from assistant tool calls.
  const toolCallMetaMap = new Map();
  const rememberToolMeta = (toolCallId: string, toolName: string) => {
    if (!toolCallId) return;
    const name = toolName || "tool";
    toolCallMetaMap.set(toolCallId, { name });
    const normalized = normalizeToolCallId(toolCallId);
    if (normalized && normalized !== toolCallId) {
      toolCallMetaMap.set(normalized, { name });
    }
  };

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        rememberToolMeta(tc.id || "", tc.function?.name || "tool");
      }
    }
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as ToolUsePart[]) {
        if (part?.type !== "tool_use") continue;
        rememberToolMeta(part.id || "", part.name || "tool");
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "system") {
      result.push({
        role: "user",
        content: `[System Instructions]\n${extractContent(msg.content)}`,
      });
      continue;
    }

    if (msg.role === "tool") {
      const toolContent = extractContent(msg.content);
      const toolCallId = msg.tool_call_id || "";
      const toolMeta = toolCallMetaMap.get(toolCallId) || {};
      const toolName = msg.name || toolMeta.name || "tool";
      result.push({
        role: "user",
        content: buildToolResultBlock(toolName, toolCallId, toolContent),
      });
      continue;
    }

    if (msg.role === "user" || msg.role === "assistant") {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const parts: string[] = [];
        for (const block of msg.content as Array<TextPart | ToolResultPart>) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "text") {
            if (typeof (block as TextPart).text === "string") {
              parts.push((block as TextPart).text || "");
            }
            continue;
          }
          if (block.type === "tool_result") {
            const tr = block as ToolResultPart;
            const toolCallId = tr.tool_use_id || "";
            const toolMeta =
              toolCallMetaMap.get(toolCallId) ||
              toolCallMetaMap.get(normalizeToolCallId(toolCallId));
            const toolName = toolMeta?.name || "tool";
            const toolContent = extractContent(tr.content);
            parts.push(buildToolResultBlock(toolName, toolCallId, toolContent));
          }
        }
        const joined = parts.filter(Boolean).join("\n");
        if (joined) result.push({ role: "user", content: joined });
        continue;
      }

      const content = extractContent(msg.content);

      if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
        const assistantMsg: {
          role: string;
          content?: string;
          tool_calls?: unknown;
        } = { role: "assistant", content: content || "" };
        assistantMsg.tool_calls = msg.tool_calls.map((tc) => {
          const { index: _index, ...rest } = tc || {};
          return rest;
        });
        result.push(assistantMsg);
      } else if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const extractedToolCalls = (msg.content as ToolUsePart[])
          .filter((b) => b?.type === "tool_use")
          .map((b) => ({
            id: b.id || "",
            type: "function",
            function: {
              name: b.name || "tool",
              arguments: JSON.stringify(b.input || {}),
            },
          }))
          .filter((tc) => tc.id);

        if (extractedToolCalls.length > 0) {
          result.push({
            role: "assistant",
            content: content || "",
            tool_calls: extractedToolCalls,
          });
        } else if (content) {
          result.push({ role: "assistant", content });
        }
      } else {
        if (content) {
          result.push({ role: msg.role, content });
        }
      }
    }
  }

  return result;
}

/**
 * Transform OpenAI request to Cursor format
 * Returns modified body with converted messages
 */
export function buildCursorRequest(model, body, _stream, _credentials) {
  const messages = convertMessages(body.messages || []);

  return {
    ...body,
    messages,
  };
}

register(FORMATS.OPENAI, FORMATS.CURSOR, buildCursorRequest, null);
