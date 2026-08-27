import { prepareClaudeRequest } from "../../translator/helpers/claudeHelper.ts";
import { CLAUDE_CODE_COMPATIBLE_PREFIX } from "./constants.ts";
import { cloneValue, readRecord, toNonEmptyString } from "./shared.ts";

function normalizeClaudeContentBlock(block: unknown) {
  const record = readRecord(cloneValue(block));
  if (!record) return null;

  if (
    record.type === "text" ||
    (typeof record.type !== "string" && typeof record.text === "string")
  ) {
    const text = toNonEmptyString(record.text);
    if (!text) return null;
    return {
      ...record,
      type: "text",
      text,
    };
  }

  return record;
}

function normalizeClaudeContentBlocks(content: unknown) {
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ type: "text", text }] : [];
  }

  if (!Array.isArray(content)) {
    const block = normalizeClaudeContentBlock(content);
    return block ? [block] : [];
  }

  return content
    .map((block) => normalizeClaudeContentBlock(block))
    .filter((block): block is Record<string, unknown> => !!block);
}

function normalizeClaudeContentInput(content: unknown) {
  const blocks = normalizeClaudeContentBlocks(content);
  return blocks.length > 0 ? blocks : content;
}

function normalizeClaudeSystemInput(system: unknown) {
  if (typeof system === "string") {
    const text = system.trim();
    return text ? [{ type: "text", text }] : [];
  }

  if (!Array.isArray(system)) return [];
  return system
    .map((block) => normalizeClaudeContentBlock(block))
    .filter((block): block is Record<string, unknown> => !!block);
}

function normalizeClaudeMessageInput(messages: unknown) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const record = readRecord(message);
      if (!record) return null;

      return {
        ...record,
        content: normalizeClaudeContentInput(record.content),
      };
    })
    .filter(Boolean);
}

function normalizeClaudeToolInput(tools: unknown) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) => readRecord(cloneValue(tool)))
    .filter((tool): tool is Record<string, unknown> => !!tool);
}

function prepareClaudeCodeCompatibleBody(
  claudeBody: Record<string, unknown>,
  preserveCacheControl: boolean
) {
  void preserveCacheControl;
  const prepared = prepareClaudeRequest(
    {
      system: normalizeClaudeSystemInput(claudeBody.system),
      messages: normalizeClaudeMessageInput(claudeBody.messages),
      tools: normalizeClaudeToolInput(claudeBody.tools),
      thinking: readRecord(claudeBody.thinking) || claudeBody.thinking,
    },
    CLAUDE_CODE_COMPATIBLE_PREFIX,
    true
  );

  return readRecord(prepared);
}

export { normalizeClaudeContentBlocks, prepareClaudeCodeCompatibleBody };
