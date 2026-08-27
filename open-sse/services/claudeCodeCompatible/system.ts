import type { MessageLike } from "./shared.ts";
import { contentToText, formatDate } from "./shared.ts";
import { stripEmbeddedAnthropicBillingLines } from "./messages.ts";

function extractCustomSystemBlocks(messages: MessageLike[] | undefined) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => {
      const role = String(message?.role || "").toLowerCase();
      return role === "system" || role === "developer";
    })
    .map((message) => stripEmbeddedAnthropicBillingLines(contentToText(message?.content)))
    .filter(Boolean)
    .map((text) => ({
      type: "text",
      text,
    }));
}

function buildClaudeCodeCompatibleSystemBlocks({
  messages,
  systemBlocks,
  cwd,
  now,
  preserveCacheControl,
  billingHeader,
}: {
  messages: MessageLike[] | undefined;
  systemBlocks?: Array<Record<string, unknown>> | undefined;
  cwd: string;
  now: Date;
  preserveCacheControl: boolean;
  billingHeader: string;
}) {
  const customSystemBlocks =
    Array.isArray(systemBlocks) && systemBlocks.length > 0
      ? systemBlocks.map((block) => ({ ...block }))
      : extractCustomSystemBlocks(messages);

  const dateText = formatDate(now);
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: billingHeader,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
    },
    {
      type: "text",
      text: `You are Claude Code, Anthropic's official CLI for Claude.\n\nCWD: ${cwd}\nDate: ${dateText}`,
    },
  ];

  for (const systemBlock of customSystemBlocks) {
    const preparedBlock: Record<string, unknown> = { ...systemBlock };
    if (!preserveCacheControl) {
      delete preparedBlock.cache_control;
    }
    if (typeof preparedBlock.text === "string") {
      preparedBlock.text = stripEmbeddedAnthropicBillingLines(preparedBlock.text);
    }
    blocks.push(preparedBlock);
  }

  return blocks;
}

export { buildClaudeCodeCompatibleSystemBlocks };
