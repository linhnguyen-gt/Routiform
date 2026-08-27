/**
 * Strip literal <thinking>...</thinking> spans from Kiro assistantResponseEvent content.
 *
 * @module executors/kiro/thinking-tags
 */
import type { KiroStreamState } from "./types.ts";

const THINKING_OPEN = "<thinking>";
const THINKING_CLOSE = "</thinking>";
const CODE_FENCE = "```";

/**
 * Length of the longest suffix of `text` that is also a prefix of `tag` — used to detect
 * a tag opening/closing marker split across two assistantResponseEvent frames, so we don't
 * emit a partial "<thi" fragment as visible content.
 */
function partialTagOverlapLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length);
  for (let len = max; len > 0; len--) {
    if (text.slice(-len) === tag.slice(0, len)) return len;
  }
  return 0;
}

/** Longest tail overlap of `text` against any candidate marker — the amount that must be
 * held back because a future chunk could complete it into a real marker. */
function maxPartialOverlap(text: string, tags: string[]): number {
  let max = 0;
  for (const tag of tags) {
    const overlap = partialTagOverlapLength(text, tag);
    if (overlap > max) max = overlap;
  }
  return max;
}

/**
 * Strip literal <thinking>...</thinking> spans from assistantResponseEvent content before
 * forwarding to the client. Claude models on Kiro emit these inline, duplicating what
 * reasoningContentEvent already delivers as reasoning_content. Stateful across calls so a
 * tag split across two events (chunk boundary) is still stripped correctly.
 *
 * A <thinking> marker found inside a fenced code block (```...```) is treated as literal
 * text, not a real tag — Kiro drives coding agents that legitimately discuss prompt/tag
 * formats in code fences, and stripping those would corrupt the code sample.
 *
 * This function only ever DROPS bytes when they fall between a real (non-fenced)
 * <thinking> and its matching </thinking>. Every other byte — including one caught
 * inside an unterminated <thinking> span — is either emitted here or held in
 * state.thinkingBuffer for the caller to flush at stream end (see flush() below), so a
 * missing closing tag can never silently truncate the response.
 */
export function stripThinkingTags(state: KiroStreamState, chunk: string): string {
  state.thinkingBuffer += chunk;
  let out = "";

  for (;;) {
    if (state.thinkingInTag) {
      const closeIdx = state.thinkingBuffer.indexOf(THINKING_CLOSE);
      if (closeIdx === -1) {
        // Still inside the thinking span (or the closing tag hasn't fully arrived yet).
        // Thinking content is discarded here, but the caller flushes it as plain text
        // at stream end if no closing tag ever shows up — see flush().
        return out;
      }
      state.thinkingBuffer = state.thinkingBuffer.slice(closeIdx + THINKING_CLOSE.length);
      state.thinkingInTag = false;
      continue;
    }

    if (state.inCodeFence) {
      const fenceIdx = state.thinkingBuffer.indexOf(CODE_FENCE);
      if (fenceIdx === -1) {
        // Inside a fenced code block — pass everything through verbatim; <thinking>
        // markers here are literal text, not a real tag.
        const overlap = partialTagOverlapLength(state.thinkingBuffer, CODE_FENCE);
        out += state.thinkingBuffer.slice(0, state.thinkingBuffer.length - overlap);
        state.thinkingBuffer = overlap > 0 ? state.thinkingBuffer.slice(-overlap) : "";
        return out;
      }
      out += state.thinkingBuffer.slice(0, fenceIdx + CODE_FENCE.length);
      state.thinkingBuffer = state.thinkingBuffer.slice(fenceIdx + CODE_FENCE.length);
      state.inCodeFence = false;
      continue;
    }

    // Not in a fence and not in a thinking span — whichever marker (fence open or
    // thinking open) appears first in the buffer determines what happens next.
    const fenceIdx = state.thinkingBuffer.indexOf(CODE_FENCE);
    const openIdx = state.thinkingBuffer.indexOf(THINKING_OPEN);

    if (fenceIdx === -1 && openIdx === -1) {
      // Neither marker fully present — hold back a possible partial marker at the tail
      // (e.g. buffer ends with "<thin" or "``") so it doesn't leak into visible output.
      const overlap = maxPartialOverlap(state.thinkingBuffer, [CODE_FENCE, THINKING_OPEN]);
      out += state.thinkingBuffer.slice(0, state.thinkingBuffer.length - overlap);
      state.thinkingBuffer = overlap > 0 ? state.thinkingBuffer.slice(-overlap) : "";
      return out;
    }

    if (fenceIdx !== -1 && (openIdx === -1 || fenceIdx < openIdx)) {
      out += state.thinkingBuffer.slice(0, fenceIdx + CODE_FENCE.length);
      state.thinkingBuffer = state.thinkingBuffer.slice(fenceIdx + CODE_FENCE.length);
      state.inCodeFence = true;
      continue;
    }

    out += state.thinkingBuffer.slice(0, openIdx);
    state.thinkingBuffer = state.thinkingBuffer.slice(openIdx + THINKING_OPEN.length);
    state.thinkingInTag = true;
  }
}
