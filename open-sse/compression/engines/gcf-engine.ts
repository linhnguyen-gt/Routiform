import { resolveContainer } from "../engine-types.ts";
import type { CompressionEngine, EngineContext, EngineResult } from "../engine-types.ts";
import { encodeTabular, GCF_LEGEND } from "./gcf-codec.ts";

/**
 * Applies the tabular codec to tool-result payloads that parse as JSON arrays.
 *
 * Tool results only — never prose. A model's own words are not a data structure, and re-encoding
 * them as one would be a different transform than the codec's round-trip proof covers.
 *
 * Ships gate-cleared: false, and that is not caution about correctness. The encoding IS lossless
 * (property-tested), but losslessness is a claim about bytes, not about whether a model reads
 * `{h:[...],r:[[...]]}` as well as it reads a list of objects. That question is answered by Phase
 * 03's task-success measurement, not by this file, so the engine is available under `aggressive`
 * and stays out of the default set until measured.
 */

const GCF_PREFIX = "GCF/1 ";

function encodeText(text: string): string | null {
  // Cheap reject before paying for a parse: a JSON array's first non-space character is '['.
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("[")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const envelope = encodeTabular(parsed);
  if (!envelope) return null;

  const encoded = `${GCF_PREFIX}${GCF_LEGEND}\n${JSON.stringify(envelope)}`;
  // The codec already refused to grow the payload, but the legend is added here, so the final
  // decision about size has to be made here too.
  return encoded.length < text.length ? encoded : null;
}

/** Rewrite one message's tool output in place; return the byte delta, or null when unchanged. */
function compressEntry(
  msg: Record<string, unknown>
): { bytesBefore: number; bytesAfter: number } | null {
  let bytesBefore = 0;
  let bytesAfter = 0;

  const record = (before: string, after: string) => {
    bytesBefore += before.length;
    bytesAfter += after.length;
  };

  // OpenAI Responses: { type:"function_call_output", output: string | [{type:"input_text",text}] }
  if (msg.type === "function_call_output") {
    if (typeof msg.output === "string") {
      const next = encodeText(msg.output);
      if (!next) return null;
      record(msg.output, next);
      msg.output = next;
      return { bytesBefore, bytesAfter };
    }
    if (Array.isArray(msg.output)) {
      for (const raw of msg.output as unknown[]) {
        const part = raw as Record<string, unknown> | null;
        if (!part || part.type !== "input_text" || typeof part.text !== "string") continue;
        const next = encodeText(part.text);
        if (!next) continue;
        record(part.text, next);
        part.text = next;
      }
      return bytesAfter < bytesBefore ? { bytesBefore, bytesAfter } : null;
    }
    return null;
  }

  // OpenAI chat: { role:"tool", content: string }
  if (msg.role === "tool" && typeof msg.content === "string") {
    const next = encodeText(msg.content);
    if (!next) return null;
    record(msg.content, next);
    msg.content = next;
    return { bytesBefore, bytesAfter };
  }

  if (!Array.isArray(msg.content)) return null;

  for (const raw of msg.content as unknown[]) {
    const block = raw as Record<string, unknown> | null;
    if (!block) continue;

    // OpenAI chat, array form.
    if (msg.role === "tool" && block.type === "text" && typeof block.text === "string") {
      const next = encodeText(block.text);
      if (!next) continue;
      record(block.text, next);
      block.text = next;
      continue;
    }

    // Claude tool_result, string and array forms. Error traces are preserved verbatim, matching
    // RTK's carve-out: a stack trace is what someone reads to debug, not a payload to re-encode.
    if (block.type !== "tool_result" || block.is_error === true) continue;

    if (typeof block.content === "string") {
      const next = encodeText(block.content);
      if (!next) continue;
      record(block.content, next);
      block.content = next;
      continue;
    }

    if (Array.isArray(block.content)) {
      for (const rawPart of block.content as unknown[]) {
        const part = rawPart as Record<string, unknown> | null;
        if (!part || part.type !== "text" || typeof part.text !== "string") continue;
        const next = encodeText(part.text);
        if (!next) continue;
        record(part.text, next);
        part.text = next;
      }
    }
  }

  return bytesAfter < bytesBefore ? { bytesBefore, bytesAfter } : null;
}

export const gcfEngine: CompressionEngine = {
  id: "gcf",
  stage: "lossless",
  order: 300,
  gateCleared: false,

  supports(ctx: EngineContext): boolean {
    return ctx.bodyShape !== "kiro" && ctx.bodyShape !== "unknown";
  },

  apply(body: Record<string, unknown>): Omit<EngineResult, "reverted"> {
    const container = resolveContainer(body);
    if (!container) {
      return { applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] };
    }

    const touchedIndices: number[] = [];
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (let i = 0; i < container.items.length; i++) {
      const msg = container.items[i];
      if (!msg || typeof msg !== "object") continue;
      const delta = compressEntry(msg);
      if (!delta) continue;
      touchedIndices.push(i);
      bytesBefore += delta.bytesBefore;
      bytesAfter += delta.bytesAfter;
    }

    return {
      applied: touchedIndices.length > 0,
      stats: { arraysEncoded: touchedIndices.length },
      bytesBefore,
      bytesAfter,
      touchedIndices,
    };
  },
};
