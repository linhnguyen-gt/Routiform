import { withPreservedSpans } from "../preservation.ts";
import { resolveContainer } from "../engine-types.ts";
import type { CompressionEngine, EngineContext } from "../engine-types.ts";

/**
 * Lite: whitespace collapse and data-URL trimming. Lossless, order 50 — ahead of RTK, because
 * shrinking prose before RTK's budget-based filters run means those budgets buy more content.
 *
 * Lossless here is a real claim, not a label: everything `preservation.ts` masks (code fences,
 * inline code, URLs) comes back byte-identical, tool-role messages are skipped entirely, and
 * the engine computes its candidate output first and declines when there is nothing to gain —
 * so it never mutates a body it is not shrinking, and therefore never needs a revert.
 */

/** A data URL longer than this is trimmed; below it, trimming costs more churn than it saves. */
const DATA_URL_KEEP = 64;
const DATA_URL_RE = /^(data:[^;,]+;base64,)([A-Za-z0-9+/=]+)$/;

/**
 * Prose roles only. Tool output is data: collapsing whitespace in a file read or a grep result
 * changes what the model believes the file contains, which is not a lossless transform however
 * reversible the bytes are.
 */
const PROSE_ROLES = new Set(["user", "assistant", "system", "developer"]);

function collapse(text: string): string {
  return withPreservedSpans(text, (plain) =>
    plain
      // Runs of spaces/tabs, but never across a newline — indentation of the NEXT line survives.
      .replace(/[ \t]{2,}/g, " ")
      // Three or more newlines carry no more meaning than a paragraph break.
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}

function trimDataUrl(url: string): string {
  const match = DATA_URL_RE.exec(url);
  if (!match) return url;
  const [, prefix, payload] = match;
  if (payload.length <= DATA_URL_KEEP) return url;
  return `${prefix}${payload.slice(0, DATA_URL_KEEP)}`;
}

/** Rewrite one message's content, returning null when nothing would change. */
function compressEntry(
  msg: Record<string, unknown>
): { bytesBefore: number; bytesAfter: number } | null {
  const role = typeof msg.role === "string" ? msg.role : "";
  if (role && !PROSE_ROLES.has(role)) return null;

  if (typeof msg.content === "string") {
    const next = collapse(msg.content);
    if (next === msg.content || next.length >= msg.content.length) return null;
    const before = msg.content.length;
    msg.content = next;
    return { bytesBefore: before, bytesAfter: next.length };
  }

  if (!Array.isArray(msg.content)) return null;

  let bytesBefore = 0;
  let bytesAfter = 0;
  for (const raw of msg.content as unknown[]) {
    const part = raw as Record<string, unknown> | null;
    if (!part) continue;

    if (typeof part.text === "string" && (part.type === "text" || part.type === "input_text")) {
      const next = collapse(part.text);
      if (next !== part.text && next.length < part.text.length) {
        bytesBefore += part.text.length;
        bytesAfter += next.length;
        part.text = next;
      }
      continue;
    }

    const image = part.image_url as Record<string, unknown> | undefined;
    if (image && typeof image.url === "string") {
      const next = trimDataUrl(image.url);
      if (next !== image.url) {
        bytesBefore += image.url.length;
        bytesAfter += next.length;
        image.url = next;
      }
    }
  }

  return bytesAfter < bytesBefore ? { bytesBefore, bytesAfter } : null;
}

export const liteEngine: CompressionEngine = {
  id: "lite",
  stage: "lossless",
  order: 50,
  // Not yet measured against the Phase 03 corpus, so it stays out of `safe` and `balanced` and
  // ships only under `aggressive` or an explicit custom toggle. An install upgrading into this
  // code therefore keeps producing byte-identical requests — the promise V3 exists to keep.
  gateCleared: false,

  supports(ctx: EngineContext): boolean {
    // Kiro nests its content under conversationState, which this engine does not walk. Saying so
    // is better than applying and reporting a zero-byte saving that looks like a bug.
    return ctx.bodyShape !== "kiro" && ctx.bodyShape !== "unknown";
  },

  apply(body: Record<string, unknown>) {
    const container = resolveContainer(body);
    if (!container) {
      return {
        applied: false,
        stats: {},
        bytesBefore: 0,
        bytesAfter: 0,
        touchedIndices: [],
      };
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
      stats: { messagesTouched: touchedIndices.length },
      bytesBefore,
      bytesAfter,
      touchedIndices,
    };
  },
};
