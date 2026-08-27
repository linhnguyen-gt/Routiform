import { normalizeClaudeContentBlocks } from "./claude-input.ts";
import type { MessageLike } from "./shared.ts";
import { contentToText, toNonEmptyString } from "./shared.ts";

type ClaudeCodeCompatibleMessage = {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
};

function isPlainAssistantPrefillBlock(block: Record<string, unknown>) {
  const type = String(block.type || "text");
  return type === "text" || type === "thinking" || type === "redacted_thinking";
}

function trimTrailingAssistantPrefillBlocks(message: ClaudeCodeCompatibleMessage) {
  const content = [...message.content];
  while (content.length > 0 && isPlainAssistantPrefillBlock(content[content.length - 1])) {
    content.pop();
  }
  return {
    ...message,
    content,
  };
}

function isPlainAssistantPrefillMessage(message: ClaudeCodeCompatibleMessage) {
  return message.role === "assistant" && message.content.every(isPlainAssistantPrefillBlock);
}

function convertClaudeCodeCompatibleMessage(
  message: MessageLike | null | undefined
): ClaudeCodeCompatibleMessage | null {
  const rawRole = String(message?.role || "").toLowerCase();
  const role: ClaudeCodeCompatibleMessage["role"] | null =
    rawRole === "user"
      ? "user"
      : rawRole === "assistant" || rawRole === "model"
        ? "assistant"
        : null;

  if (!role) return null;

  const text = contentToText(message?.content);
  if (!text) return null;

  return {
    role,
    content: [{ type: "text", text }],
  };
}

function convertClaudeCodeCompatibleClaudeMessage(
  message: MessageLike | null | undefined,
  preserveCacheControl: boolean
) {
  const rawRole = String(message?.role || "").toLowerCase();
  const role = rawRole === "user" ? "user" : rawRole === "assistant" ? "assistant" : null;

  if (!role) return null;

  const content = normalizeClaudeContentBlocks(message?.content).map((block) => {
    if (preserveCacheControl) return block;
    const { cache_control: _cache_control, ...rest } = block;
    return rest;
  });
  if (content.length === 0) return null;

  return {
    role,
    content,
  };
}

function stripCacheControlFromContentBlocks(content: Array<Record<string, unknown>>) {
  for (const block of content) {
    delete block.cache_control;
  }
}

/** Strip duplicate billing header lines clients embed in system content (#1712 parity). */
export function stripEmbeddedAnthropicBillingLines(text: string): string {
  const cleaned = String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*x-anthropic-billing-header\s*:/i.test(line.trim()))
    .join("\n")
    .trim();
  return cleaned;
}

function buildClaudeCodeCompatibleMessages(messages: MessageLike[]) {
  const converted = messages
    .map((message) => convertClaudeCodeCompatibleMessage(message))
    .filter(
      (
        message
      ): message is { role: "user" | "assistant"; content: Array<Record<string, unknown>> } =>
        !!message && message.content.length > 0
    );

  const merged: Array<{ role: "user" | "assistant"; content: Array<Record<string, unknown>> }> = [];

  for (const message of converted) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content.push(...message.content);
      continue;
    }
    merged.push({ role: message.role, content: [...message.content] });
  }

  // CC-compatible sites we tested reject plain assistant-prefill shaped requests.
  // Trim trailing text/thinking prefill from the final assistant turn, then drop it if empty.
  while (merged.length > 0 && merged[merged.length - 1].role === "assistant") {
    merged[merged.length - 1] = trimTrailingAssistantPrefillBlocks(merged[merged.length - 1]);
    if (!isPlainAssistantPrefillMessage(merged[merged.length - 1])) {
      break;
    }
    merged.pop();
  }

  if (merged.length === 0) {
    const fallbackText = converted
      .flatMap((message) => message.content)
      .map((block) => toNonEmptyString(block.text))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (fallbackText) {
      return [
        {
          role: "user" as const,
          content: [{ type: "text", text: fallbackText }],
        },
      ];
    }
  }

  return merged;
}

function buildClaudeCodeCompatibleMessagesFromClaude(
  messages: MessageLike[] | undefined,
  preserveCacheControl: boolean
) {
  const converted = Array.isArray(messages)
    ? messages
        .map((message) => convertClaudeCodeCompatibleClaudeMessage(message, preserveCacheControl))
        .filter(
          (
            message
          ): message is { role: "user" | "assistant"; content: Array<Record<string, unknown>> } =>
            !!message && message.content.length > 0
        )
    : [];

  const merged: Array<{ role: "user" | "assistant"; content: Array<Record<string, unknown>> }> = [];

  for (const message of converted) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content.push(...message.content);
      continue;
    }
    merged.push({ role: message.role, content: [...message.content] });
  }

  while (merged.length > 0 && merged[merged.length - 1].role === "assistant") {
    merged[merged.length - 1] = trimTrailingAssistantPrefillBlocks(merged[merged.length - 1]);
    if (!isPlainAssistantPrefillMessage(merged[merged.length - 1])) {
      break;
    }
    merged.pop();
  }

  if (!preserveCacheControl) {
    for (const message of merged) {
      stripCacheControlFromContentBlocks(message.content);
    }
  }

  if (merged.length === 0) {
    const fallbackText = converted
      .flatMap((message) => message.content)
      .map((block) => contentToText(block))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (fallbackText) {
      return [
        {
          role: "user" as const,
          content: [{ type: "text", text: fallbackText }],
        },
      ];
    }
  }

  return merged;
}

export {
  buildClaudeCodeCompatibleMessages,
  buildClaudeCodeCompatibleMessagesFromClaude,
  type ClaudeCodeCompatibleMessage,
};
