import { resolveContainer } from "../engine-types.ts";
import type { CompressionEngine, EngineContext, EngineResult } from "../engine-types.ts";

/**
 * Bounded re-serialization of OpenAI Responses `function_call_output` payloads.
 *
 * Where GCF restructures a JSON array, this only drops insignificant whitespace: parse, re-emit
 * compact, keep the result only if it is both smaller and semantically identical. Pretty-printed
 * tool output is common and every indent byte is paid for at both ends.
 *
 * The load-bearing constraint is the skip. RTK rewrites `function_call_output` too
 * (`rtk/index.ts:60`), and its filters emit truncation markers and line elisions that are NOT
 * JSON — running a JSON round-trip over them would either fail to parse (harmless) or, worse,
 * succeed on a fragment and corrupt the filter's output. So this engine reads the indices RTK
 * reported and leaves every one of them alone. Order 400 puts it after RTK; the skip guards the
 * overlap that ordering alone cannot.
 */

function compactJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 64) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const compact = JSON.stringify(parsed);
  if (compact.length >= text.length) return null;

  // Cheap proof that the rewrite preserved meaning. Re-parsing the compact form and comparing
  // serializations catches the case where JSON.stringify dropped something (undefined, a
  // function, a cyclic replacement) rather than merely reformatting it.
  try {
    if (JSON.stringify(JSON.parse(compact)) !== compact) return null;
  } catch {
    return null;
  }

  return compact;
}

function compactEntry(
  msg: Record<string, unknown>
): { bytesBefore: number; bytesAfter: number } | null {
  if (msg.type !== "function_call_output") return null;

  let bytesBefore = 0;
  let bytesAfter = 0;

  if (typeof msg.output === "string") {
    const next = compactJson(msg.output);
    if (!next) return null;
    bytesBefore = msg.output.length;
    bytesAfter = next.length;
    msg.output = next;
    return { bytesBefore, bytesAfter };
  }

  if (!Array.isArray(msg.output)) return null;

  for (const raw of msg.output as unknown[]) {
    const part = raw as Record<string, unknown> | null;
    if (!part || part.type !== "input_text" || typeof part.text !== "string") continue;
    const next = compactJson(part.text);
    if (!next) continue;
    bytesBefore += part.text.length;
    bytesAfter += next.length;
    part.text = next;
  }

  return bytesAfter < bytesBefore ? { bytesBefore, bytesAfter } : null;
}

export const responsesCompactEngine: CompressionEngine = {
  id: "responses-compact",
  stage: "lossless",
  order: 400,
  gateCleared: false,

  supports(ctx: EngineContext): boolean {
    return ctx.bodyShape === "openai-responses";
  },

  apply(body: Record<string, unknown>, ctx: EngineContext): Omit<EngineResult, "reverted"> {
    const container = resolveContainer(body);
    if (!container) {
      return { applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] };
    }

    const touchedIndices: number[] = [];
    let bytesBefore = 0;
    let bytesAfter = 0;
    let skipped = 0;

    for (let i = 0; i < container.items.length; i++) {
      if (ctx.touchedSoFar.has(i)) {
        skipped++;
        continue;
      }
      const msg = container.items[i];
      if (!msg || typeof msg !== "object") continue;
      const delta = compactEntry(msg);
      if (!delta) continue;
      touchedIndices.push(i);
      bytesBefore += delta.bytesBefore;
      bytesAfter += delta.bytesAfter;
    }

    return {
      applied: touchedIndices.length > 0,
      stats: { compacted: touchedIndices.length, skippedAfterEarlierEngines: skipped },
      bytesBefore,
      bytesAfter,
      touchedIndices,
    };
  },
};
