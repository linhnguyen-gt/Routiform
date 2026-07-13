/**
 * CommandCode → OpenAI response translator
 *
 * CommandCode upstream emits NDJSON-style AI SDK v5 stream events:
 *   {"type":"start"} {"type":"start-step", ...}
 *   {"type":"reasoning-start","id":"..."} {"type":"reasoning-delta","text":"..."}
 *   {"type":"text-start","id":"..."}     {"type":"text-delta","text":"..."}
 *   {"type":"tool-input-start","id","toolName"}
 *   {"type":"tool-input-delta","id","delta"}
 *   {"type":"tool-input-end","id"}
 *   {"type":"tool-call","toolCallId","toolName","input"}
 *   {"type":"finish-step","finishReason","usage": {...}, ...}
 *   {"type":"finish",...}
 */
import { FORMATS } from "../formats.ts";
import { register } from "../registry.ts";

type JsonRecord = Record<string, unknown>;

type CommandCodeState = {
  responseId?: string;
  created?: number;
  model?: string;
  chunkIndex?: number;
  toolIndex?: number;
  toolIndexById?: Map<string, number>;
  openTools?: Set<string>;
  openText?: boolean;
  finishReason?: string | null;
  usage?: JsonRecord | null;
};

type OpenAIChunk = {
  id: string | undefined;
  object: "chat.completion.chunk";
  created: number | undefined;
  model: string;
  choices: Array<{
    index: number;
    delta: JsonRecord;
    finish_reason: string | null;
  }>;
  usage?: JsonRecord;
};

function ensureState(state: CommandCodeState, model?: string): void {
  if (!state.responseId) {
    state.responseId = `chatcmpl-${Date.now()}`;
    state.created = Math.floor(Date.now() / 1000);
    state.model = state.model || model || "commandcode";
    state.chunkIndex = 0;
    state.toolIndex = 0;
    state.toolIndexById = new Map();
    state.openTools = new Set();
    state.openText = false;
    state.finishReason = null;
    state.usage = null;
  }
}

function makeChunk(
  state: CommandCodeState,
  delta: JsonRecord,
  finishReason: string | null = null
): OpenAIChunk {
  return {
    id: state.responseId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model || "commandcode",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/**
 * Normalize CommandCode's AI-SDK-v5-shaped usage (camelCase inputTokens/
 * outputTokens/totalTokens) to the snake_case shape the shared cost-tracking
 * utilities expect (hasValidUsage/extractUsage in ../../utils/usageTracking.ts
 * only recognize prompt_tokens/completion_tokens/input_tokens/output_tokens).
 * Storing the raw camelCase object in `state.usage` made real reported usage
 * invisible to those utilities, so a heuristic estimate silently replaced it
 * downstream (open-sse/utils/stream.ts). Normalize once, here, so `state.usage`
 * is always canonical snake_case — matching how kiro-to-openai.ts already
 * normalizes its own camelCase usageEvent before assigning to state.usage.
 * Emits both the OpenAI-shape (prompt_tokens/completion_tokens, what this
 * translator's target format uses) and the input_tokens/output_tokens alias,
 * mirroring claude-to-openai.ts's state.usage (message_start handler) which
 * stores both conventions side by side for callers that expect either.
 */
function normalizeCommandCodeUsage(usage: JsonRecord | undefined | null): JsonRecord | null {
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.totalTokens ?? usage.total_tokens ?? inputTokens + outputTokens);
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

function mapFinishReason(reason?: string): string {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool-calls":
    case "tool_use":
      return "tool_calls";
    case "content-filter":
      return "content_filter";
    case "error":
      return "stop";
    default:
      return reason || "stop";
  }
}

export function convertCommandCodeToOpenAI(
  chunk: JsonRecord | string | null | undefined,
  state: CommandCodeState
): OpenAIChunk[] | null {
  if (!chunk) return null;

  // Already-OpenAI chunk: pass through
  if (
    chunk &&
    typeof chunk === "object" &&
    (chunk as JsonRecord).object === "chat.completion.chunk"
  ) {
    return [chunk as unknown as OpenAIChunk];
  }

  let event: JsonRecord;
  if (typeof chunk === "string") {
    const line = chunk.trim();
    if (!line) return null;
    const json = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!json || json === "[DONE]") return null;
    try {
      event = JSON.parse(json) as JsonRecord;
    } catch {
      return null;
    }
  } else {
    event = chunk;
  }

  if (!event || typeof event !== "object" || !event.type) return null;

  ensureState(state, event.model as string | undefined);
  const out: OpenAIChunk[] = [];

  switch (event.type) {
    case "text-delta": {
      const text = (event.text || event.delta || "") as string;
      if (!text) break;
      const delta: JsonRecord =
        state.chunkIndex === 0 ? { role: "assistant", content: text } : { content: text };
      state.chunkIndex = (state.chunkIndex ?? 0) + 1;
      state.openText = true;
      out.push(makeChunk(state, delta));
      break;
    }
    case "reasoning-delta": {
      const text = (event.text || "") as string;
      if (!text) break;
      const delta: JsonRecord =
        state.chunkIndex === 0
          ? { role: "assistant", reasoning_content: text }
          : { reasoning_content: text };
      state.chunkIndex = (state.chunkIndex ?? 0) + 1;
      out.push(makeChunk(state, delta));
      break;
    }
    case "tool-input-start": {
      const id = (event.id ||
        event.toolCallId ||
        `call_${Date.now()}_${state.toolIndex}`) as string;
      let idx = state.toolIndexById!.get(id);
      if (idx == null) {
        idx = state.toolIndex!;
        state.toolIndex = idx + 1;
        state.toolIndexById!.set(id, idx);
      }
      state.openTools!.add(id);
      const delta: JsonRecord = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [
          {
            index: idx,
            id,
            type: "function",
            function: { name: (event.toolName || "") as string, arguments: "" },
          },
        ],
      };
      state.chunkIndex = (state.chunkIndex ?? 0) + 1;
      out.push(makeChunk(state, delta));
      break;
    }
    case "tool-input-delta": {
      const id = (event.id || event.toolCallId) as string;
      const idx = state.toolIndexById!.get(id);
      if (idx == null) break;
      const delta: JsonRecord = {
        tool_calls: [
          {
            index: idx,
            function: { arguments: (event.delta || event.inputTextDelta || "") as string },
          },
        ],
      };
      out.push(makeChunk(state, delta));
      break;
    }
    case "tool-call": {
      const id = event.toolCallId as string;
      if (state.toolIndexById!.has(id)) break;
      const idx = state.toolIndex!;
      state.toolIndex = idx + 1;
      state.toolIndexById!.set(id, idx);
      const argsStr =
        typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {});
      const delta: JsonRecord = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [
          {
            index: idx,
            id,
            type: "function",
            function: { name: (event.toolName || "") as string, arguments: argsStr },
          },
        ],
      };
      state.chunkIndex = (state.chunkIndex ?? 0) + 1;
      out.push(makeChunk(state, delta));
      break;
    }
    case "finish-step": {
      state.finishReason = mapFinishReason(event.finishReason as string | undefined);
      const normalized = normalizeCommandCodeUsage(event.usage as JsonRecord | undefined);
      if (normalized) state.usage = normalized;
      break;
    }
    case "finish": {
      const finishReason =
        state.finishReason || mapFinishReason((event.finishReason || "stop") as string);
      const finalChunk = makeChunk(state, {}, finishReason);
      const totalUsage =
        normalizeCommandCodeUsage(event.totalUsage as JsonRecord | undefined) || state.usage;
      if (totalUsage) {
        finalChunk.usage = totalUsage;
      }
      out.push(finalChunk);
      break;
    }
    case "error": {
      state.finishReason = "stop";
      const errVal = event.error ?? event.message ?? "unknown";
      const errStr = typeof errVal === "string" ? errVal : JSON.stringify(errVal);
      out.push(makeChunk(state, { content: `\n\n[CommandCode error: ${errStr}]` }));
      out.push(makeChunk(state, {}, "stop"));
      break;
    }
    default:
      break;
  }

  return out.length ? out : null;
}

register(FORMATS.COMMANDCODE, FORMATS.OPENAI, undefined, convertCommandCodeToOpenAI);
