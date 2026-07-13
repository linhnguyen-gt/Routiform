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
// Gemini's `contents` array uses "model" instead of "assistant" for the
// equivalent turn role.
const GEMINI_TARGET_ROLES = new Set(["user", "model"]);

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

function compressMessageArray(
  items: Array<Record<string, unknown>>,
  stats: CavemanStats,
  targetRoles: Set<string>
): void {
  for (const msg of items) {
    if (!msg || typeof msg !== "object") continue;
    const role = String(msg.role || "");
    if (!targetRoles.has(role)) continue;
    if (msg.content == null) continue;
    msg.content = mapContent(msg.content, stats);
  }
}

// Gemini shape: `contents: [{role, parts:[{text}, {inlineData}, {functionCall}, ...]}]`.
// Only `{text}` parts hold prose; other part kinds (inline data, function
// call/response) are left untouched.
function compressGeminiContents(items: Array<Record<string, unknown>>, stats: CavemanStats): void {
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const role = String(entry.role || "");
    if (!GEMINI_TARGET_ROLES.has(role)) continue;
    if (!Array.isArray(entry.parts)) continue;

    for (const part of entry.parts as Array<Record<string, unknown>>) {
      if (!part || typeof part !== "object" || typeof part.text !== "string") continue;
      stats.bytesBefore += part.text.length;
      const next = compressText(part.text);
      stats.bytesAfter += next.length;
      if (next !== part.text) {
        stats.messagesTouched += 1;
        part.text = next;
      }
    }
  }
}

/**
 * Caveman-style prose compression on chat messages (EN rules).
 * Mutates body in place. Skips tool / tool_result roles and error payloads.
 *
 * Handles the three inbound message-array shapes: OpenAI/Claude `messages`,
 * OpenAI Responses `input` (same `{role, content}` shape as `messages`), and
 * Gemini `contents` (`{role, parts:[{text}]}`).
 */
export function cavemanCompressMessages(
  body: Record<string, unknown> | null | undefined
): CavemanStats | null {
  if (!body) return null;

  const stats: CavemanStats = { messagesTouched: 0, bytesBefore: 0, bytesAfter: 0 };

  if (Array.isArray(body.messages)) {
    compressMessageArray(body.messages as Array<Record<string, unknown>>, stats, TARGET_ROLES);
  } else if (Array.isArray(body.input)) {
    compressMessageArray(body.input as Array<Record<string, unknown>>, stats, TARGET_ROLES);
  } else if (Array.isArray(body.contents)) {
    compressGeminiContents(body.contents as Array<Record<string, unknown>>, stats);
  } else {
    return null;
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
