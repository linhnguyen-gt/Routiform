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

/**
 * Accumulate OpenAI `delta.content` when it is a string, array of parts (Gemini/Cline), or a single object.
 * @see https://docs.cline.bot/api/chat-completions — reasoning may appear in `delta.reasoning` or structured content.
 */
function appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts) {
  const d = toRecord(delta);
  const c = d.content;

  if (typeof c === "string" && c.length > 0) {
    contentParts.push(c);
    return;
  }

  if (Array.isArray(c)) {
    for (const part of c) {
      if (typeof part === "string" && part.length > 0) {
        contentParts.push(part);
        continue;
      }
      const block = toRecord(part);
      const bt = typeof block.type === "string" ? block.type.toLowerCase() : "";
      const chunk =
        (typeof block.text === "string" ? block.text : "") ||
        (typeof block.content === "string" ? block.content : "");
      if (!chunk) continue;
      if (!bt || bt === "text" || bt === "output_text" || bt === "text_delta") {
        contentParts.push(chunk);
      } else if (
        bt.includes("reason") ||
        bt.includes("think") ||
        bt === "model_thought" ||
        bt === "thought"
      ) {
        reasoningParts.push(chunk);
      }
    }
    return;
  }

  if (c && typeof c === "object" && !Array.isArray(c)) {
    const o = toRecord(c);
    if (typeof o.text === "string" && o.text.length > 0) contentParts.push(o.text);
    else if (typeof o.content === "string" && o.content.length > 0) contentParts.push(o.content);
  }
}

export function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const chunks = collectOpenAIChatCompletionChunks(rawSSE);

  if (chunks.length === 0) return null;

  const first = chunks[0];
  const contentParts = [];
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
        contentParts.push(fm.content);
      }
      if (typeof fm.refusal === "string" && fm.refusal.length > 0) {
        contentParts.push(fm.refusal);
      }
    }

    appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts);

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      reasoningParts.push(delta.reasoning_content);
    }
    // Normalize `reasoning` alias (NVIDIA kimi-k2.5 etc.)
    if (
      typeof delta.reasoning === "string" &&
      delta.reasoning.length > 0 &&
      !delta.reasoning_content
    ) {
      reasoningParts.push(delta.reasoning);
    }
    if (typeof delta.thinking === "string" && delta.thinking.length > 0) {
      reasoningParts.push(delta.thinking);
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
            existing.function = existing.function || {};
            existing.function.name = tc.function.name;
          }
          existing.function = existing.function || {};
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

  const joinedContent = contentParts.length > 0 ? contentParts.join("").trim() : "";
  const joinedReasoning = reasoningParts.length > 0 ? reasoningParts.join("").trim() : null;
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
      } else if (blockType === "tool_use") {
        blocks.set(index, {
          type: "tool_use",
          index,
          id: toString(contentBlock.id, `toolu_${Date.now()}_${index}`),
          name: toString(contentBlock.name),
          input: contentBlock.input ?? {},
          inputJson: "",
        });
      } else {
        blocks.set(index, {
          type: "text",
          index,
          text: toString(contentBlock.text),
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
          existing && existing.type === "tool_use"
            ? existing
            : {
                type: "tool_use",
                index,
                id: `toolu_${Date.now()}_${index}`,
                name: "",
                input: {},
                inputJson: "",
              };
        toolUse.inputJson += toString(delta.partial_json);
        blocks.set(index, toolUse);
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

      const textBlock =
        existing && existing.type === "text"
          ? existing
          : {
              type: "text",
              index,
              text: "",
            };
      textBlock.text += toString(delta.text);
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

  const content = [...blocks.values()]
    .sort((a, b) => a.index - b.index)
    .flatMap((block) => {
      if (block.type === "text") {
        return block.text ? [{ type: "text", text: block.text }] : [];
      }
      if (block.type === "thinking") {
        return block.thinking
          ? [
              {
                type: "thinking",
                thinking: block.thinking,
                ...(block.signature ? { signature: block.signature } : {}),
              },
            ]
          : [];
      }

      const parsedInput =
        block.inputJson.trim().length > 0 ? tryParseJson(block.inputJson) : block.input;
      return [
        {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: parsedInput,
        },
      ];
    });

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
