// Claude helper functions for translator
import { capThinkingBudget, getDefaultThinkingBudget } from "@/shared/constants/modelSpecs";
import { DEFAULT_THINKING_CLAUDE_SIGNATURE } from "../../config/defaultThinkingSignature.ts";

const DEFAULT_THINKING_BUDGET_FALLBACK = 10240;

/**
 * Claude Code sends thinking.type "adaptive", which Anthropic-compatible upstreams
 * reject with 400 "Improperly formed request." Normalize to API-supported shape.
 */
export function sanitizeAnthropicThinkingPayload(body: Record<string, unknown>): void {
  const thinking = body.thinking as Record<string, unknown> | undefined;
  if (!thinking || typeof thinking !== "object") return;

  if (thinking.type === "adaptive") {
    thinking.type = "enabled";
  }

  if (thinking.type !== "enabled") return;

  const modelId = typeof body.model === "string" ? body.model : "";
  const budgetRaw = thinking.budget_tokens;
  let budgetNum =
    typeof budgetRaw === "number" && Number.isFinite(budgetRaw)
      ? budgetRaw
      : typeof budgetRaw === "string" && String(budgetRaw).trim()
        ? Number(String(budgetRaw).trim())
        : NaN;

  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    const fromSpec = getDefaultThinkingBudget(modelId);
    const raw = fromSpec > 0 ? fromSpec : DEFAULT_THINKING_BUDGET_FALLBACK;
    budgetNum = capThinkingBudget(modelId, raw);
  } else {
    budgetNum = capThinkingBudget(modelId, budgetNum);
  }

  thinking.budget_tokens = budgetNum;

  const maxTok = body.max_tokens;
  if (typeof maxTok === "number" && maxTok <= budgetNum) {
    body.max_tokens = budgetNum + 8192;
  }
}

function isAssistantActionBlock(block) {
  return (
    block?.type === "tool_use" ||
    block?.type === "server_tool_use" ||
    block?.type === "web_search_tool_result" ||
    block?.type === "web_fetch_tool_result"
  );
}

function isValidClaudeContentBlock(block) {
  return (
    (block?.type === "text" && block.text?.trim()) ||
    block?.type === "tool_result" ||
    block?.type === "document" ||
    isAssistantActionBlock(block)
  );
}

// Check if message has valid non-empty content
export function hasValidContent(msg) {
  if (typeof msg.content === "string" && msg.content.trim()) return true;
  if (Array.isArray(msg.content)) {
    return msg.content.some((block) => isValidClaudeContentBlock(block));
  }
  return false;
}

// Re-hydrate text blocks that encode tool_result back to tool_result blocks.
// chatCore.ts converts tool_result → "[Tool Result: <id>]\n<text>" when routing
// through non-Claude providers. This reverses that conversion before sending to Claude.
export function rehydrateToolResultTextBlocks(messages: unknown[]): void {
  const TOOL_RESULT_RE = /^\[Tool Result: ([^\]]+)\]\n?([\s\S]*)$/;

  const toolUseIds = new Set<string>();
  for (const msg of messages) {
    const message = msg as Record<string, unknown>;
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        const contentBlock = block as Record<string, unknown>;
        if (contentBlock.type === "tool_use" && contentBlock.id) {
          toolUseIds.add(String(contentBlock.id));
        }
      }
    }
  }

  for (const msg of messages) {
    const message = msg as Record<string, unknown>;
    if (message.role === "user" && Array.isArray(message.content)) {
      const content = message.content as Array<{ type: string; text?: string }>;
      message.content = content.flatMap((block: { type: string; text?: string }) => {
        if (block.type !== "text") return [block];
        const m = TOOL_RESULT_RE.exec(block.text ?? "");
        if (!m) return [block];
        const [, callId, resultText] = m;
        if (!toolUseIds.has(callId)) return [block];
        return [{ type: "tool_result", tool_use_id: callId, content: resultText.trim() }];
      });
    }
  }
}

// Fix tool_use/tool_result ordering for Claude API
// 1. Assistant message with tool_use: remove text AFTER tool_use (Claude doesn't allow)
// 2. Merge consecutive same-role messages
export function fixToolUseOrdering(messages) {
  // Pass 1: Fix assistant messages with action blocks - remove text after first action block
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const hasAssistantAction = msg.content.some((block) => isAssistantActionBlock(block));
      if (hasAssistantAction) {
        const newContent = [];
        let foundAssistantAction = false;

        for (const block of msg.content) {
          if (isAssistantActionBlock(block)) {
            foundAssistantAction = true;
            newContent.push(block);
            continue;
          }
          if (block.type === "thinking" || block.type === "redacted_thinking") {
            newContent.push(block);
            continue;
          }
          if (!foundAssistantAction) {
            newContent.push(block);
          }
        }

        msg.content = newContent;
      }
    }
  }

  // Pass 2: Merge consecutive same-role messages
  const merged = [];

  for (const msg of messages) {
    const last = merged[merged.length - 1];

    if (last && last.role === msg.role) {
      // Merge content arrays
      const lastContent = Array.isArray(last.content)
        ? last.content
        : [{ type: "text", text: last.content }];
      const msgContent = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text", text: msg.content }];

      // Put user tool_result blocks first, then other content.
      // Native assistant runtime/result blocks must keep relative order with action blocks.
      const isToolResultBlock = (block) => block.type === "tool_result";
      last.content = [
        ...lastContent.filter((block) => isToolResultBlock(block)),
        ...msgContent.filter((block) => isToolResultBlock(block)),
        ...lastContent.filter((block) => !isToolResultBlock(block)),
        ...msgContent.filter((block) => !isToolResultBlock(block)),
      ];
    } else {
      // Ensure content is array
      const content = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text", text: msg.content }];
      merged.push({ role: msg.role, content: [...content] });
    }
  }

  for (const msg of merged) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      continue;
    }
    const normalizedContent = [];
    let foundAssistantAction = false;

    for (const block of msg.content) {
      if (isAssistantActionBlock(block)) {
        foundAssistantAction = true;
        normalizedContent.push(block);
        continue;
      }
      if (block.type === "thinking" || block.type === "redacted_thinking") {
        normalizedContent.push(block);
        continue;
      }
      if (!foundAssistantAction) {
        normalizedContent.push(block);
      }
    }

    msg.content = normalizedContent;
  }

  return merged;
}

function ensureMessageContentArray(msg) {
  if (Array.isArray(msg?.content)) return msg.content;
  if (typeof msg?.content === "string" && msg.content.trim()) {
    msg.content = [{ type: "text", text: msg.content }];
    return msg.content;
  }
  return [];
}

function markMessageCacheControl(msg: unknown, ttl: number | undefined = undefined) {
  const content = ensureMessageContentArray(msg);
  if (content.length === 0) return false;
  const lastIndex = content.length - 1;
  const lastContent = content[lastIndex] as Record<string, unknown>;
  lastContent.cache_control =
    ttl !== undefined ? { type: "ephemeral", ttl } : { type: "ephemeral" };
  return true;
}

// Prepare request for Claude format endpoints
// - Cleanup cache_control (unless preserveCacheControl=true for passthrough)
// - Filter empty messages
// - Add thinking block for Anthropic endpoint (provider === "claude")
// - Fix tool_use/tool_result ordering
export function prepareClaudeRequest(body, provider = null, preserveCacheControl = false) {
  sanitizeAnthropicThinkingPayload(body);

  // 1. System: remove all cache_control, add only to last block with ttl 1h
  // In passthrough mode, preserve existing cache_control markers
  if (body.system && Array.isArray(body.system) && !preserveCacheControl) {
    body.system = body.system.map((block, i) => {
      const { cache_control: _cache_control, ...rest } = block;
      if (i === body.system.length - 1) {
        return { ...rest, cache_control: { type: "ephemeral", ttl: "1h" } };
      }
      return rest;
    });
  }

  // 2. Messages: process in optimized passes
  if (body.messages && Array.isArray(body.messages)) {
    const len = body.messages.length;
    let filtered = [];

    // Pass 1: remove cache_control + filter empty messages
    // In passthrough mode, preserve existing cache_control markers
    for (let i = 0; i < len; i++) {
      const msg = body.messages[i];

      // Remove cache_control from content blocks (skip in passthrough mode)
      if (Array.isArray(msg.content) && !preserveCacheControl) {
        for (const block of msg.content) {
          delete block.cache_control;
        }
      }

      // Keep final assistant even if empty, otherwise check valid content
      const isFinalAssistant = i === len - 1 && msg.role === "assistant";
      if (isFinalAssistant || hasValidContent(msg)) {
        filtered.push(msg);
      }
    }

    // Pass 1.4: Filter out tool_use blocks with empty names (causes Claude 400 error)
    // Apply to ALL roles (assistant tool_use + any user messages that may carry tool_use)
    // Also filter tool_result blocks with missing tool_use_id
    for (const msg of filtered) {
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.filter(
          (block) => block.type !== "tool_use" || (block.name && block.name?.trim())
        );
        msg.content = msg.content.filter(
          (block) => block.type !== "tool_result" || block.tool_use_id
        );
      }
    }

    // Also filter top-level tool declarations with empty names
    if (body.tools && Array.isArray(body.tools)) {
      body.tools = body.tools.filter((tool) => tool.name && tool.name?.trim());
    }

    // Pass 1.45: Re-hydrate [Tool Result: id] text blocks → tool_result blocks
    rehydrateToolResultTextBlocks(filtered);

    // Pass 1.5: Fix tool_use/tool_result ordering
    // Each tool_use must have tool_result in the NEXT message (not same message with other content)
    filtered = fixToolUseOrdering(filtered);

    body.messages = filtered;

    // Check if thinking is enabled AND last message is from user
    const lastMessage = filtered[filtered.length - 1];
    const lastMessageIsUser = lastMessage?.role === "user";
    const thinkingEnabled = body.thinking?.type === "enabled" && lastMessageIsUser;

    // Claude Code-style prompt caching:
    // - cache the second-to-last user turn for conversation reuse
    // - cache the last assistant turn so the next user turn can reuse it
    // Skip in passthrough mode to preserve client's cache_control markers
    if (!preserveCacheControl) {
      const userMessageIndexes = filtered.reduce((indexes, msg, index) => {
        if (msg?.role === "user") indexes.push(index);
        return indexes;
      }, []);
      const secondToLastUserIndex =
        userMessageIndexes.length >= 2 ? userMessageIndexes[userMessageIndexes.length - 2] : -1;
      if (secondToLastUserIndex >= 0) {
        markMessageCacheControl(filtered[secondToLastUserIndex]);
      }
    }

    // Pass 2 (reverse): add cache_control to last assistant + handle thinking for Anthropic
    let lastAssistantProcessed = false;
    let latestAssistantFound = false;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const msg = filtered[i];

      if (msg.role === "assistant" && Array.isArray(ensureMessageContentArray(msg))) {
        // Add cache_control to last block of first (from end) assistant with content
        // Skip in passthrough mode to preserve client's cache_control markers
        if (!preserveCacheControl && !lastAssistantProcessed && markMessageCacheControl(msg)) {
          lastAssistantProcessed = true;
        }

        // Handle thinking blocks for Anthropic endpoints (native + compatible)
        if (provider === "claude" || provider?.startsWith?.("anthropic-compatible-")) {
          let hasToolUse = false;
          let hasThinking = false;

          // Preserve the latest assistant message's thinking blocks verbatim — Anthropic
          // requires the original signature on the most recent turn or returns HTTP 400.
          // Older turns are safe to normalize with the default signature.
          // Use a separate tracker so this works regardless of cache_control path or
          // whether the latest assistant message has content blocks.
          const isLatestAssistant = !latestAssistantFound;
          latestAssistantFound = true;

          for (const block of msg.content) {
            if (block.type === "thinking" || block.type === "redacted_thinking") {
              if (!isLatestAssistant) {
                block.signature = DEFAULT_THINKING_CLAUDE_SIGNATURE;
              }
              hasThinking = true;
            }
            if (block.type === "tool_use") hasToolUse = true;
          }

          // Add thinking block if thinking enabled + has tool_use but no thinking
          if (thinkingEnabled && !hasThinking && hasToolUse) {
            msg.content.unshift({
              type: "thinking",
              thinking: ".",
              signature: DEFAULT_THINKING_CLAUDE_SIGNATURE,
            });
          }
        }
      }
    }
  }

  // 3. Tools: remove all cache_control, add only to last non-deferred tool with ttl 1h
  // Tools with defer_loading=true cannot have cache_control (API rejects it)
  // In passthrough mode, preserve existing cache_control markers
  if (body.tools && Array.isArray(body.tools) && !preserveCacheControl) {
    body.tools = body.tools.map((tool) => {
      const { cache_control: _cache_control, ...rest } = tool;
      return rest;
    });
    for (let i = body.tools.length - 1; i >= 0; i--) {
      if (!body.tools[i].defer_loading) {
        body.tools[i].cache_control = { type: "ephemeral", ttl: "1h" };
        break;
      }
    }
  }

  return body;
}
