// RTK Token Saver: compress tool_result content in LLM request bodies.
// Runs after inbound translation, before the request is dispatched upstream.
import { RAW_CAP, MIN_COMPRESS_SIZE } from "./constants.ts";
import { autoDetectFilter } from "./autodetect.ts";
import { safeApply } from "./apply-filter.ts";
import type { RtkProfile, RtkStats, RtkFilterContext } from "./types.ts";

type MutableRecord = Record<string, unknown>;

function asRecord(value: unknown): MutableRecord | null {
  return value && typeof value === "object" ? (value as MutableRecord) : null;
}

// Filters that destroy semantic precision needed by coding agents
// (middle-of-file cut, line-number-range loss). Skipped in "safe" mode —
// the blob is passed through untouched if these are autodetected.
const UNSAFE_FILTER_NAMES = new Set(["read-numbered", "smart-truncate"]);

// Backward-compat shim: accept the legacy `enabled: boolean` second argument.
// - boolean → treated as off (false) / full (true)
// - RtkProfile → used directly
type CompressArg = RtkProfile | boolean;

function normalizeProfile(arg: CompressArg): RtkProfile {
  if (typeof arg === "boolean") return arg ? "full" : "off";
  return arg;
}

// Compress tool_result content in-place. Returns stats or null if disabled/failed.
export function compressMessages(
  body: Record<string, unknown> | null | undefined,
  arg: CompressArg
): RtkStats | null {
  const profile = normalizeProfile(arg);
  if (profile === "off") return null;
  if (!body) return null;

  const ctx: RtkFilterContext = { profile };

  // Kiro format: conversationState.history + conversationState.currentMessage
  if (body.conversationState) {
    return compressKiroFormat(body, ctx);
  }

  // Support both OpenAI/Claude "messages" and OpenAI Responses "input"
  const items = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.input)
      ? body.input
      : null;
  if (!items) return null;

  const stats: RtkStats = { bytesBefore: 0, bytesAfter: 0, hits: [] };
  try {
    for (let i = 0; i < items.length; i++) {
      const msg = asRecord(items[i]);
      if (!msg) continue;

      // Shape 4: OpenAI Responses — top-level { type:"function_call_output", output: string | [{type:"input_text", text}] }
      if (msg.type === "function_call_output") {
        if (typeof msg.output === "string") {
          msg.output = compressText(msg.output, stats, "openai-responses-string", ctx);
        } else if (Array.isArray(msg.output)) {
          for (let k = 0; k < msg.output.length; k++) {
            const part = asRecord(msg.output[k]);
            if (part && part.type === "input_text" && typeof part.text === "string") {
              part.text = compressText(part.text, stats, "openai-responses-array", ctx);
            }
          }
        }
        continue;
      }

      // Shape 1: OpenAI tool message — { role:"tool", content: "string" }
      if (msg.role === "tool" && typeof msg.content === "string") {
        msg.content = compressText(msg.content, stats, "openai-tool", ctx);
        continue;
      }

      if (!Array.isArray(msg.content)) continue;

      // Shape 1b: OpenAI tool message — { role:"tool", content:[{type:"text", text:"..."}] }
      if (msg.role === "tool") {
        for (let k = 0; k < msg.content.length; k++) {
          const part = asRecord(msg.content[k]);
          if (part && part.type === "text" && typeof part.text === "string") {
            part.text = compressText(part.text, stats, "openai-tool-array", ctx);
          }
        }
        continue;
      }

      // Shape 2/3: blocks array with tool_result entries
      for (let j = 0; j < msg.content.length; j++) {
        const block = asRecord(msg.content[j]);
        if (!block || block.type !== "tool_result") continue;
        if (block.is_error === true) continue; // preserve error traces

        if (typeof block.content === "string") {
          // Shape 2: claude string form
          block.content = compressText(block.content, stats, "claude-string", ctx);
        } else if (Array.isArray(block.content)) {
          // Shape 3: claude array form — compress each text part
          for (let k = 0; k < block.content.length; k++) {
            const part = asRecord(block.content[k]);
            if (part && part.type === "text" && typeof part.text === "string") {
              part.text = compressText(part.text, stats, "claude-array", ctx);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[RTK] compressMessages error:", e instanceof Error ? e.message : String(e));
    return null;
  }
  return stats;
}

// Compress Kiro format: conversationState.history[].userInputMessage.userInputMessageContext.toolResults[].content[].text
function compressKiroFormat(body: Record<string, unknown>, ctx: RtkFilterContext): RtkStats | null {
  const stats: RtkStats = { bytesBefore: 0, bytesAfter: 0, hits: [] };
  try {
    const state = asRecord(body.conversationState);
    const allMessages = [...(Array.isArray(state?.history) ? state.history : [])];
    if (state?.currentMessage) allMessages.push(state.currentMessage);

    for (const rawMsg of allMessages) {
      const msg = asRecord(rawMsg);
      const userInputMessage = asRecord(msg?.userInputMessage);
      const userInputMessageContext = asRecord(userInputMessage?.userInputMessageContext);
      const toolResults = userInputMessageContext?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const rawTr of toolResults) {
        const tr = asRecord(rawTr);
        if (!tr) continue;
        if (tr.status === "error") continue; // preserve error traces
        if (!Array.isArray(tr.content)) continue;

        for (const rawPart of tr.content) {
          const part = asRecord(rawPart);
          if (part && typeof part.text === "string") {
            part.text = compressText(part.text, stats, "kiro-tool-result", ctx);
          }
        }
      }
    }
  } catch (e) {
    console.warn("[RTK] compressKiroFormat error:", e instanceof Error ? e.message : String(e));
    return null;
  }
  return stats;
}

function compressText(text: string, stats: RtkStats, shape: string, ctx: RtkFilterContext): string {
  const bytesIn = text.length;
  stats.bytesBefore += bytesIn;

  if (bytesIn < MIN_COMPRESS_SIZE || bytesIn > RAW_CAP) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  const fn = autoDetectFilter(text);
  if (!fn) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  // Safe mode: skip filters that destroy semantic precision for coding agents.
  // The blob is passed through untouched so the model sees the full content.
  if (ctx.profile === "safe" && UNSAFE_FILTER_NAMES.has(fn.filterName || fn.name || "")) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  const out = safeApply(fn, text, ctx);

  // Safety: never return empty, never grow the input
  if (!out || out.length === 0 || out.length >= bytesIn) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  stats.bytesAfter += out.length;
  stats.hits.push({ shape, filter: fn.filterName || fn.name, saved: bytesIn - out.length });
  return out;
}

// Convenience: format a log line from stats
export function formatRtkLog(stats: RtkStats | null): string | null {
  if (!stats || !stats.hits || stats.hits.length === 0) return null;
  const saved = stats.bytesBefore - stats.bytesAfter;
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : "0";
  const filters = Array.from(new Set(stats.hits.map((h) => h.filter))).join(",");
  return `[RTK] saved ${saved}B / ${stats.bytesBefore}B (${pct}%) via [${filters}] hits=${stats.hits.length}`;
}
