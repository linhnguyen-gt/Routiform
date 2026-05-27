import { generateToolUseId } from "@routiform/open-sse/translator/helpers/toolCallHelper.ts";
import { normalizePlaceholderOnlyAssistantText } from "../utils/assistantContent.ts";

/**
 * Convert OpenAI-style SSE chunks into a single non-streaming JSON response.
 * Used as a fallback when upstream returns text/event-stream for stream=false.
 */
function readSSEEvents(rawSSE) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];
  let currentEvent = "";
  let currentData = [];

  const flush = () => {
    if (currentData.length === 0) {
      currentEvent = "";
      return;
    }

    const payload = currentData.join("\n").trim();
    currentData = [];
    if (!payload || payload === "[DONE]") {
      currentEvent = "";
      return;
    }

    try {
      events.push({
        event: currentEvent || undefined,
        data: JSON.parse(payload),
      });
    } catch {
      // Ignore malformed SSE events and continue best-effort parsing.
    }

    currentEvent = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      flush();
      continue;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trimStart());
    }
  }

  flush();
  return events;
}

/**
 * Collect OpenAI-style stream JSON objects. Prefer RFC SSE parsing (handles multi-line `data:` payloads);
 * fall back to one `data:` line = one JSON object (common OpenAI/Cline stream).
 */
function collectOpenAIChatCompletionChunks(rawSSE) {
  const events = readSSEEvents(rawSSE);
  const fromEvents = events
    .map((e) => e.data)
    .filter((d) => d != null && typeof d === "object" && !Array.isArray(d));
  if (fromEvents.length > 0) return fromEvents;

  const lines = String(rawSSE || "").split("\n");
  const chunks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      // Ignore malformed SSE lines and continue best-effort parsing.
    }
  }
  return chunks;
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeClaudeCitations(value) {
  if (Array.isArray(value)) return cloneJson(value);
  if (value && typeof value === "object") return [cloneJson(value)];
  return undefined;
}

function appendTextPart(parts, chunk) {
  if (typeof chunk !== "string" || chunk.length === 0) return;
  const lastIndex = parts.length - 1;
  if (lastIndex < 0) {
    parts.push(chunk);
    return;
  }

  const previous = parts[lastIndex];

  // Some upstreams send cumulative snapshots instead of true deltas.
  // Prefer the latest snapshot instead of duplicating text.
  if (chunk === previous) return;
  if (chunk.startsWith(previous)) {
    parts[lastIndex] = chunk;
    return;
  }

  // Deduplicate overlap when snapshots partially repeat prior output.
  const maxOverlap = Math.min(previous.length, chunk.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (previous.slice(previous.length - overlap) === chunk.slice(0, overlap)) {
      parts.push(chunk.slice(overlap));
      return;
    }
  }

  parts.push(chunk);
}

function collapseExactDuplicateMessage(text) {
  let value = typeof text === "string" ? text : "";
  for (let pass = 0; pass < 3; pass += 1) {
    const len = value.length;
    if (len < 4) break;

    let collapsed = false;
    const mid = Math.floor(len / 2);
    for (let offset = -3; offset <= 3; offset += 1) {
      const splitAt = mid + offset;
      if (splitAt <= 0 || splitAt >= len) continue;
      const first = value.slice(0, splitAt);
      const secondRaw = value.slice(splitAt);
      const second = secondRaw.replace(/^\s+/, "");

      if (first !== second) continue;
      if (!/[\s.!?;:,)\]]$/.test(first)) continue;
      value = first;
      collapsed = true;
      break;
    }

    if (!collapsed) break;
  }
  return value;
}

/**
 * Accumulate OpenAI `delta.content` when it is a string, array of parts (Gemini/Cline), or a single object.
 * @see https://docs.cline.bot/api/chat-completions — reasoning may appear in `delta.reasoning` or structured content.
 */
function appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts) {
  const d = toRecord(delta);
  const c = d.content;

  if (typeof c === "string" && c.length > 0) {
    appendTextPart(contentParts, c);
    return;
  }

  if (Array.isArray(c)) {
    for (const part of c) {
      if (typeof part === "string" && part.length > 0) {
        appendTextPart(contentParts, part);
        continue;
      }
      const block = toRecord(part);
      const bt = typeof block.type === "string" ? block.type.toLowerCase() : "";
      const chunk =
        (typeof block.text === "string" ? block.text : "") ||
        (typeof block.content === "string" ? block.content : "");
      if (!chunk) continue;
      if (!bt || bt === "text" || bt === "output_text" || bt === "text_delta") {
        appendTextPart(contentParts, chunk);
      } else if (
        bt.includes("reason") ||
        bt.includes("think") ||
        bt === "model_thought" ||
        bt === "thought"
      ) {
        appendTextPart(reasoningParts, chunk);
      }
    }
    return;
  }

  if (c && typeof c === "object" && !Array.isArray(c)) {
    const o = toRecord(c);
    if (typeof o.text === "string" && o.text.length > 0) appendTextPart(contentParts, o.text);
    else if (typeof o.content === "string" && o.content.length > 0)
      appendTextPart(contentParts, o.content);
  }
}

export function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const chunks = collectOpenAIChatCompletionChunks(rawSSE);

  if (chunks.length === 0) return null;

  const first = chunks[0];
  const contentParts = [];
  const fallbackMessageParts = [];
  const reasoningParts = [];
  type AccumulatedToolCall = {
    id: string | null;
    index: number;
    type: string;
    function: { name: string; arguments: string };
  };

  const accumulatedToolCalls = new Map<string, AccumulatedToolCall>();
  let unknownToolCallSeq = 0;
  let finishReason = "stop";
  let usage = null;

  const getToolCallKey = (toolCall: Record<string, unknown>) => {
    if (Number.isInteger(toolCall?.index)) return `idx:${toolCall.index}`;
    if (toolCall?.id) return `id:${toolCall.id}`;
    unknownToolCallSeq += 1;
    return `seq:${unknownToolCallSeq}`;
  };

  for (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};

    // Some gateways send a final chunk with `message` instead of/in addition to `delta`.
    const fullMessage = choice?.message;
    if (fullMessage && typeof fullMessage === "object") {
      const fm = toRecord(fullMessage);
      if (typeof fm.content === "string" && fm.content.length > 0) {
        appendTextPart(fallbackMessageParts, fm.content);
      }
      if (typeof fm.refusal === "string" && fm.refusal.length > 0) {
        appendTextPart(fallbackMessageParts, fm.refusal);
      }
    }

    appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts);

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      appendTextPart(reasoningParts, delta.reasoning_content);
    }
    // Normalize `reasoning` alias (NVIDIA kimi-k2.5 etc.)
    if (
      typeof delta.reasoning === "string" &&
      delta.reasoning.length > 0 &&
      !delta.reasoning_content
    ) {
      appendTextPart(reasoningParts, delta.reasoning);
    }
    if (typeof delta.thinking === "string" && delta.thinking.length > 0) {
      appendTextPart(reasoningParts, delta.thinking);
    }

    // T18: Accumulate tool calls correctly across streamed chunks
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const key = getToolCallKey(tc);
        const existing = accumulatedToolCalls.get(key);
        const deltaArgs = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";

        if (!existing) {
          accumulatedToolCalls.set(key, {
            id: tc?.id ?? null,
            index: Number.isInteger(tc?.index) ? tc.index : accumulatedToolCalls.size,
            type: tc?.type || "function",
            function: {
              name: tc?.function?.name || "unknown",
              arguments: deltaArgs,
            },
          });
        } else {
          existing.id = existing.id || tc?.id || null;
          if (!Number.isInteger(existing.index) && Number.isInteger(tc?.index)) {
            existing.index = tc.index;
          }
          if (tc?.function?.name && !existing.function?.name) {
            existing.function.name = tc.function.name;
          }
          existing.function.arguments = `${existing.function.arguments || ""}${deltaArgs}`;
          accumulatedToolCalls.set(key, existing);
        }
      }
    }

    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (chunk?.usage && typeof chunk.usage === "object") {
      usage = chunk.usage;
    }
  }

  const selectedContentParts = contentParts.length > 0 ? contentParts : fallbackMessageParts;
  const joinedContentRaw =
    selectedContentParts.length > 0
      ? collapseExactDuplicateMessage(selectedContentParts.join("").trim())
      : "";
  const joinedContent = normalizePlaceholderOnlyAssistantText(joinedContentRaw);
  const joinedReasoning =
    reasoningParts.length > 0
      ? collapseExactDuplicateMessage(reasoningParts.join("").trim())
      : null;
  const message: Record<string, unknown> = {
    role: "assistant",
    content: joinedContent,
  };
  if (joinedReasoning) {
    message.reasoning_content = joinedReasoning;
  }

  const finalToolCalls = [...accumulatedToolCalls.values()].filter(Boolean).sort((a, b) => {
    const ai = Number.isInteger(a?.index) ? a.index : 0;
    const bi = Number.isInteger(b?.index) ? b.index : 0;
    return ai - bi;
  });
  if (finalToolCalls.length > 0) {
    finishReason = "tool_calls"; // T18 normalization
    message.tool_calls = finalToolCalls;
  }

  const result: Record<string, unknown> = {
    id: first.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first.created || Math.floor(Date.now() / 1000),
    model: first.model || fallbackModel || "unknown",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };

  if (usage) {
    result.usage = usage;
  }

  return result;
}

/**
 * Convert Claude-style SSE events into a single non-streaming message object.
 * Used when Claude-compatible upstreams stream even for stream=false.
 */
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

/**
 * Convert Responses API SSE events into a single non-streaming response object.
 * Expects events such as response.created / response.in_progress / response.completed.
 */
export function parseSSEToResponsesOutput(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // Ignore malformed lines and continue best-effort parsing.
    }
  }

  if (events.length === 0) return null;

  let completed = null;
  let latestResponse = null;

  for (const evt of events) {
    if (evt?.type === "response.completed" && evt.response) {
      completed = evt.response;
    }
    if (evt?.response && typeof evt.response === "object") {
      latestResponse = evt.response;
    } else if (evt?.object === "response") {
      latestResponse = evt;
    }
  }

  const picked = completed || latestResponse;
  if (!picked || typeof picked !== "object") return null;

  return {
    id: picked.id || `resp_${Date.now()}`,
    object: "response",
    model: picked.model || fallbackModel || "unknown",
    output: Array.isArray(picked.output) ? picked.output : [],
    usage: picked.usage || null,
    status: picked.status || (completed ? "completed" : "in_progress"),
    created_at: picked.created_at || Math.floor(Date.now() / 1000),
    metadata: picked.metadata || {},
  };
}
