import { withPreservedSpans } from "./preservation.ts";
import type { CavemanStats } from "./types.ts";

type Rule = { re: RegExp; to: string };

/** EN filler / hedging pack (lightweight rule set). */
const RULES: Rule[] = [
  { re: /\b(?:please|kindly)\s+/gi, to: "" },
  { re: /\b(?:I would like to|I'd like to|I want to|I need to)\b/gi, to: "" },
  { re: /\b(?:could you|can you|would you)\s+/gi, to: "" },
  { re: /\b(?:just|really|actually|basically|literally|simply|essentially)\s+/gi, to: "" },
  { re: /\b(?:very|quite|rather|somewhat|pretty)\s+/gi, to: "" },
  { re: /\b(?:I think that|I believe that|it seems that|it appears that)\b/gi, to: "" },
  { re: /\b(?:in order to)\b/gi, to: "to" },
  { re: /\b(?:as well as)\b/gi, to: "and" },
  { re: /\b(?:due to the fact that)\b/gi, to: "because" },
  { re: /\b(?:a large number of)\b/gi, to: "many" },
  { re: /\b(?:at this point in time)\b/gi, to: "now" },
  { re: /\b(?:make sure to|be sure to)\b/gi, to: "" },
  { re: /\b(?:the reason (?:why )?(?:is|was) that)\b/gi, to: "because" },
  { re: /\b(?:it is important to note that|note that|keep in mind that)\b/gi, to: "" },
  { re: /\b(?:going to)\b/gi, to: "gonna" },
  { re: /[ \t]{2,}/g, to: " " },
  { re: /\n{3,}/g, to: "\n\n" },
];

const MIN_LEN = 40;
// "system" deliberately excluded: regex filler-stripping on a system prompt
// (e.g. dropping "please"/"kindly", "going to" -> "gonna") risks mangling
// instruction wording. Only user/assistant chat turns are compressed.
const TARGET_ROLES = new Set(["user", "assistant"]);

function compressPlainText(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, rule.to);
  }
  return out.trim();
}

function compressText(text: string): string {
  if (text.length < MIN_LEN) return text;
  return withPreservedSpans(text, compressPlainText);
}

function mapContent(content: unknown, stats: CavemanStats): unknown {
  if (typeof content === "string") {
    stats.bytesBefore += content.length;
    const next = compressText(content);
    stats.bytesAfter += next.length;
    if (next !== content) stats.messagesTouched += 1;
    return next;
  }
  if (!Array.isArray(content)) return content;

  return content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const block = part as Record<string, unknown>;
    if (typeof block.text === "string" && (block.type === "text" || block.type === "input_text")) {
      stats.bytesBefore += block.text.length;
      const next = compressText(block.text);
      stats.bytesAfter += next.length;
      if (next !== block.text) {
        stats.messagesTouched += 1;
        return { ...block, text: next };
      }
    }
    return part;
  });
}

/**
 * Caveman-style prose compression on chat messages (EN rules).
 * Mutates body in place. Skips tool / tool_result roles and error payloads.
 */
export function cavemanCompressMessages(
  body: Record<string, unknown> | null | undefined
): CavemanStats | null {
  if (!body || !Array.isArray(body.messages)) return null;

  const stats: CavemanStats = { messagesTouched: 0, bytesBefore: 0, bytesAfter: 0 };
  const messages = body.messages as Array<Record<string, unknown>>;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = String(msg.role || "");
    if (!TARGET_ROLES.has(role)) continue;
    if (msg.content == null) continue;
    msg.content = mapContent(msg.content, stats);
  }

  if (stats.messagesTouched === 0 && stats.bytesBefore === 0) return null;
  return stats;
}

export function formatCavemanLog(stats: CavemanStats | null): string | null {
  if (!stats || stats.bytesBefore <= 0 || stats.messagesTouched <= 0) return null;
  const saved = stats.bytesBefore - stats.bytesAfter;
  if (saved <= 0) return null;
  const pct = Math.round((saved / stats.bytesBefore) * 100);
  return `[Caveman] saved ${saved}B (${pct}%) msgs=${stats.messagesTouched}`;
}
