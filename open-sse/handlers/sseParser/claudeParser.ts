import { generateToolUseId } from "@routiform/open-sse/translator/helpers/toolCallHelper.ts";
import { readSSEEvents } from "./sseEvents.ts";
import { normalizeClaudeCitations, cloneJson, toRecord, toString, toNumber } from "./shared.ts";

export function parseSSEToClaudeResponse(rawSSE, fallbackModel) {
  const payloads = readSSEEvents(rawSSE)
    .map((event) => toRecord(event.data))
    .filter((payload) => Object.keys(payload).length > 0);

  if (payloads.length === 0) return null;

  const blocks = new Map();
  const usage = {};
  let messageId = "";
  let model = fallbackModel || "claude";
  let role = "assistant";
  let stopReason = "end_turn";
  let stopSequence = null;

  const mergeUsage = (incoming) => {
    const usageRecord = toRecord(incoming);
    for (const [key, value] of Object.entries(usageRecord)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        usage[key] = value;
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        usage[key] = { ...toRecord(usage[key]), ...toRecord(value) };
      } else if (typeof value === "string" && value.trim().length > 0) {
        usage[key] = value;
      }
    }
  };

  const tryParseJson = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const appendText = (target, text) => {
    if (typeof text !== "string" || text.length === 0) return;
    target.text = `${typeof target.text === "string" ? target.text : ""}${text}`;
  };

  const appendCitations = (target, citations) => {
    const normalized = normalizeClaudeCitations(citations);
    if (!normalized || normalized.length === 0) return;
    target.citations = Array.isArray(target.citations)
      ? [...target.citations, ...normalized]
      : normalized;
  };

  for (const payload of payloads) {
    const eventType = toString(payload.type);
    if (eventType === "message_start") {
      const message = toRecord(payload.message);
      messageId = toString(message.id, messageId || `msg_${Date.now()}`);
      model = toString(message.model, model);
      role = toString(message.role, role);
      mergeUsage(message.usage);
      continue;
    }

    if (eventType === "content_block_start") {
      const index = toNumber(payload.index, blocks.size);
      const contentBlock = toRecord(payload.content_block);
      const blockType = toString(contentBlock.type);

      if (blockType === "thinking") {
        blocks.set(index, {
          type: "thinking",
          index,
          thinking: toString(contentBlock.thinking),
          signature:
            typeof contentBlock.signature === "string" ? contentBlock.signature : undefined,
        });
      } else if (blockType === "redacted_thinking") {
        blocks.set(index, {
          type: "redacted_thinking",
          index,
          data: cloneJson(contentBlock.data),
        });
      } else if (blockType === "tool_use" || blockType === "server_tool_use") {
        blocks.set(index, {
          type: blockType,
          index,
          id:
            toString(contentBlock.id) ||
            generateToolUseId({
              source: "sse-parser-content-block-start",
              index,
              name: contentBlock.name,
              input: contentBlock.input ?? {},
            }),
          name: toString(contentBlock.name),
          input: contentBlock.input ?? {},
          inputJson: "",
        });
      } else if (blockType === "web_search_tool_result" || blockType === "web_fetch_tool_result") {
        blocks.set(index, {
          type: blockType,
          index,
          tool_use_id: toString(contentBlock.tool_use_id),
          content: cloneJson(contentBlock.content ?? []),
          text: toString(contentBlock.text),
          citations: normalizeClaudeCitations(contentBlock.citations),
        });
      } else if (blockType === "text") {
        blocks.set(index, {
          type: "text",
          index,
          text: toString(contentBlock.text),
          citations: normalizeClaudeCitations(contentBlock.citations),
        });
      } else {
        blocks.set(index, {
          type: blockType || "text",
          index,
          block: cloneJson(contentBlock),
        });
      }
      continue;
    }

    if (eventType === "content_block_delta") {
      const index = toNumber(payload.index, 0);
      const delta = toRecord(payload.delta);
      const deltaType = toString(delta.type);
      const existing = blocks.get(index);

      if (deltaType === "input_json_delta") {
        const toolUse =
          existing && (existing.type === "tool_use" || existing.type === "server_tool_use")
            ? existing
            : {
                type: "tool_use",
                index,
                id: generateToolUseId({ source: "sse-parser-input-json-delta", index }),
                name: "",
                input: {},
                inputJson: "",
              };
        toolUse.inputJson += toString(delta.partial_json);
        blocks.set(index, toolUse);
        continue;
      }

      if (deltaType === "signature_delta" && typeof delta.signature === "string") {
        const thinking =
          existing && existing.type === "thinking"
            ? existing
            : { type: "thinking", index, thinking: "", signature: undefined };
        thinking.signature = delta.signature;
        blocks.set(index, thinking);
        continue;
      }

      if (deltaType === "thinking_delta" || typeof delta.thinking === "string") {
        const thinking =
          existing && existing.type === "thinking"
            ? existing
            : { type: "thinking", index, thinking: "", signature: undefined };
        thinking.thinking += toString(delta.thinking);
        blocks.set(index, thinking);
        continue;
      }

      if (deltaType === "citations_delta") {
        const citationTarget =
          existing && typeof existing === "object"
            ? existing
            : {
                type: "text",
                index,
                text: "",
              };
        appendCitations(citationTarget, delta.citations ?? delta.citation);
        blocks.set(index, citationTarget);
        continue;
      }

      if (
        existing &&
        (existing.type === "web_search_tool_result" || existing.type === "web_fetch_tool_result")
      ) {
        appendText(existing, toString(delta.text));
        appendCitations(existing, delta.citations ?? delta.citation);
        blocks.set(index, existing);
        continue;
      }

      if (existing && existing.block && typeof existing.block === "object") {
        const updated = {
          ...existing,
          block: { ...existing.block },
        };
        appendText(updated.block, toString(delta.text));
        appendCitations(updated.block, delta.citations ?? delta.citation);
        blocks.set(index, updated);
        continue;
      }

      const textBlock =
        existing && existing.type === "text"
          ? existing
          : {
              type: "text",
              index,
              text: "",
            };
      appendText(textBlock, toString(delta.text));
      appendCitations(textBlock, delta.citations ?? delta.citation);
      blocks.set(index, textBlock);
      continue;
    }

    if (eventType === "message_delta") {
      const delta = toRecord(payload.delta);
      stopReason = toString(delta.stop_reason, stopReason);
      stopSequence =
        typeof delta.stop_sequence === "string" ? String(delta.stop_sequence) : stopSequence;
      mergeUsage(payload.usage);
      continue;
    }

    mergeUsage(payload.usage);
  }

  type ParsedContentBlock =
    | { type: "text"; text: string; citations?: unknown[] }
    | { type: "thinking"; thinking: string; signature?: string }
    | { type: "redacted_thinking"; data?: unknown }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "server_tool_use"; id: string; name: string; input: unknown }
    | {
        type: "web_search_tool_result" | "web_fetch_tool_result";
        tool_use_id?: string;
        content?: unknown;
        text?: string;
        citations?: unknown[];
      }
    | Record<string, unknown>;

  const content: ParsedContentBlock[] = [...blocks.values()]
    .sort((a, b) => a.index - b.index)
    .reduce<ParsedContentBlock[]>((items, block) => {
      if (block.type === "text") {
        if (block.text) {
          items.push({
            type: "text",
            text: block.text,
            ...(Array.isArray(block.citations) && block.citations.length > 0
              ? { citations: block.citations }
              : {}),
          });
        }
        return items;
      }
      if (block.type === "thinking") {
        if (block.thinking) {
          items.push({
            type: "thinking",
            thinking: block.thinking,
            ...(block.signature ? { signature: block.signature } : {}),
          });
        }
        return items;
      }
      if (block.type === "redacted_thinking") {
        items.push({
          type: "redacted_thinking",
          ...(block.data !== undefined ? { data: cloneJson(block.data) } : {}),
        });
        return items;
      }
      if (block.type === "tool_use" || block.type === "server_tool_use") {
        const parsedInput =
          block.inputJson.trim().length > 0 ? tryParseJson(block.inputJson) : block.input;
        items.push({
          type: block.type,
          id: block.id,
          name: block.name,
          input: parsedInput,
        });
        return items;
      }
      if (block.type === "web_search_tool_result" || block.type === "web_fetch_tool_result") {
        items.push({
          type: block.type,
          ...(block.tool_use_id ? { tool_use_id: block.tool_use_id } : {}),
          ...(block.content !== undefined ? { content: cloneJson(block.content) } : {}),
          ...(block.text ? { text: block.text } : {}),
          ...(Array.isArray(block.citations) && block.citations.length > 0
            ? { citations: block.citations }
            : {}),
        });
        return items;
      }
      if (block.block && typeof block.block === "object") {
        items.push(cloneJson(block.block));
        return items;
      }

      return items;
    }, []);

  return {
    id: messageId || `msg_${Date.now()}`,
    type: "message",
    role,
    model,
    content,
    stop_reason: stopReason,
    ...(stopSequence ? { stop_sequence: stopSequence } : {}),
    ...(Object.keys(usage).length > 0 ? { usage } : {}),
  };
}
