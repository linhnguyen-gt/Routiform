const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Replace code fences, inline code, and URLs with placeholders so rule-based
 * compression cannot corrupt them. Restore after rules run.
 */
export function withPreservedSpans(text: string, transform: (plain: string) => string): string {
  const slots: string[] = [];
  const stash = (match: string) => {
    const i = slots.length;
    slots.push(match);
    return `\u0000P${i}\u0000`;
  };

  let masked = text.replace(FENCE_RE, stash);
  masked = masked.replace(INLINE_CODE_RE, stash);
  masked = masked.replace(URL_RE, stash);

  const transformed = transform(masked);
  return transformed.replace(/\u0000P(\d+)\u0000/g, (_m, idx) => slots[Number(idx)] ?? "");
}
