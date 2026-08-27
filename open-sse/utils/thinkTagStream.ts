/**
 * Shared STATEFUL <think> splitter with kiro-style semantics (ref:
 * executors/kiro.ts stripThinkingTags): partial markers are buffered across
 * chunk boundaries; while inside a span NOTHING is emitted — if the closing
 * tag never arrives, the whole span is restored verbatim as text at stream end
 * (see flushThinkContent), so a literal "<think>" in prose can neither be
 * swallowed nor reclassify the rest of the stream as reasoning.
 *
 * This intentionally does NOT reuse utils/thinkTagParser.ts's streaming
 * variant: it emits span content as reasoning optimistically before seeing the
 * closing tag, which cannot be undone on flush.
 */

export const THINK_OPEN = "<think>";
export const THINK_CLOSE = "</think>";

// Longest suffix of `text` that is a prefix of `marker` — bytes that could
// complete into a real marker on the next chunk and must be held back.
function partialMarkerTailLength(text: string, marker: string): number {
  const max = Math.min(text.length, marker.length - 1);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(marker.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Feed one delta into the splitter. `state` carries `thinkBuffer` and
 * `inThinkSpan` across calls. Returns text that is definitely outside any
 * think span and span content seen so far.
 */
export function consumeThinkContent(
  state: { thinkBuffer?: string; inThinkSpan?: boolean },
  delta: string
): { reasoning: string; text: string } {
  state.thinkBuffer = String(state.thinkBuffer || "") + delta;
  let reasoning = "";
  let text = "";
  for (;;) {
    if (state.inThinkSpan) {
      const closeIdx = state.thinkBuffer.indexOf(THINK_CLOSE);
      if (closeIdx === -1) return { reasoning, text };
      reasoning += state.thinkBuffer.slice(0, closeIdx);
      state.thinkBuffer = state.thinkBuffer.slice(closeIdx + THINK_CLOSE.length);
      state.inThinkSpan = false;
      continue;
    }
    const openIdx = state.thinkBuffer.indexOf(THINK_OPEN);
    if (openIdx === -1) {
      const tail = partialMarkerTailLength(state.thinkBuffer, THINK_OPEN);
      text += state.thinkBuffer.slice(0, state.thinkBuffer.length - tail);
      state.thinkBuffer = tail > 0 ? state.thinkBuffer.slice(-tail) : "";
      return { reasoning, text };
    }
    text += state.thinkBuffer.slice(0, openIdx);
    state.thinkBuffer = state.thinkBuffer.slice(openIdx + THINK_OPEN.length);
    state.inThinkSpan = true;
  }
}

/**
 * Stream end: bytes still held are either a partial-marker tail or the body of
 * an unterminated <think> span — both are literal text. Restores them verbatim.
 */
export function flushThinkContent(state: { thinkBuffer?: string; inThinkSpan?: boolean }): string {
  const rest = String(state.thinkBuffer || "");
  state.thinkBuffer = "";
  state.inThinkSpan = false;
  return rest;
}
