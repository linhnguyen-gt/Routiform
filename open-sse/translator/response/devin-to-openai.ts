import { FORMATS } from "../formats.ts";
import { register } from "../registry.ts";

type JsonRecord = Record<string, unknown>;

type DevinState = JsonRecord & {
  responseId?: string;
  created?: number;
  model?: string;
  started?: boolean;
  finishReason?: string | null;
  finishReasonSent?: boolean;
  usage?: JsonRecord | null;
};

function ensureState(state: DevinState, event?: JsonRecord): void {
  if (!state.responseId) {
    state.responseId = (event?.id as string) || `devin-${Date.now()}`;
    state.created =
      typeof event?.created === "number"
        ? (event.created as number)
        : Math.floor(Date.now() / 1000);
    state.model = (event?.model as string) || "devin";
    state.started = false;
    state.finishReason = null;
    state.finishReasonSent = false;
    state.usage = null;
  }
}

function makeChunk(state: DevinState, delta: JsonRecord, finishReason: string | null = null) {
  return {
    id: `chatcmpl-${state.responseId}`,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model || "devin",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function normalizeUsage(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value as JsonRecord;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const totalTokens =
    typeof usage.total_tokens === "number" ? usage.total_tokens : promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

export function convertDevinToOpenAI(
  chunk: JsonRecord | string | null | undefined,
  state: DevinState
): JsonRecord[] | null {
  if (chunk == null) {
    if (state.responseId && !state.finishReasonSent) {
      state.finishReasonSent = true;
      return [makeChunk(state, {}, state.finishReason || "stop")];
    }
    return null;
  }

  if (
    typeof chunk === "object" &&
    chunk !== null &&
    (chunk as JsonRecord).object === "chat.completion.chunk"
  ) {
    return [chunk as JsonRecord];
  }

  if (
    typeof chunk === "object" &&
    chunk !== null &&
    (chunk as JsonRecord).object === "devin.response"
  ) {
    const event = chunk as JsonRecord;
    ensureState(state, event);
    state.usage = normalizeUsage(event.usage);
    state.started = true;
    state.finishReason =
      typeof event.finish_reason === "string" && event.finish_reason.length > 0
        ? (event.finish_reason as string)
        : "stop";
    state.finishReasonSent = true;
    const results: JsonRecord[] = [makeChunk(state, { role: "assistant", content: "" })];
    const text =
      typeof event.output_text === "string"
        ? (event.output_text as string)
        : typeof event.text === "string"
          ? (event.text as string)
          : "";
    if (text) {
      results.push(makeChunk(state, { content: text }));
    }
    const finalChunk = makeChunk(state, {}, state.finishReason) as JsonRecord;
    if (state.usage) {
      finalChunk.usage = state.usage;
    }
    results.push(finalChunk);
    return results;
  }

  let event: JsonRecord;
  if (typeof chunk === "string") {
    const line = chunk.trim();
    if (!line) return null;
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!payload || payload === "[DONE]") return null;
    try {
      event = JSON.parse(payload) as JsonRecord;
    } catch {
      event = { type: "text-delta", delta: payload };
    }
  } else {
    event = chunk;
  }

  ensureState(state, event);

  if (event.usage) {
    state.usage = normalizeUsage(event.usage);
  }

  switch (event.type) {
    case "start": {
      if (state.started) return null;
      state.started = true;
      return [makeChunk(state, { role: "assistant", content: "" })];
    }
    case "text-delta": {
      const text =
        typeof event.delta === "string"
          ? (event.delta as string)
          : typeof event.text === "string"
            ? (event.text as string)
            : "";
      if (!text) return null;
      if (!state.started) {
        state.started = true;
        return [
          makeChunk(state, { role: "assistant", content: "" }),
          makeChunk(state, { content: text }),
        ];
      }
      return [makeChunk(state, { content: text })];
    }
    case "reasoning-delta": {
      const text =
        typeof event.delta === "string"
          ? (event.delta as string)
          : typeof event.text === "string"
            ? (event.text as string)
            : "";
      if (!text) return null;
      if (!state.started) {
        state.started = true;
        return [
          makeChunk(state, { role: "assistant", content: "" }),
          makeChunk(state, { reasoning_content: text }),
        ];
      }
      return [makeChunk(state, { reasoning_content: text })];
    }
    case "finish": {
      const finishReason =
        typeof event.finishReason === "string" && event.finishReason.length > 0
          ? (event.finishReason as string)
          : "stop";
      state.finishReason = finishReason;
      state.finishReasonSent = true;
      const finalChunk = makeChunk(state, {}, finishReason) as JsonRecord;
      if (state.usage) {
        finalChunk.usage = state.usage;
      }
      return [finalChunk];
    }
    default:
      return null;
  }
}

register(FORMATS.DEVIN, FORMATS.OPENAI, undefined, convertDevinToOpenAI);
