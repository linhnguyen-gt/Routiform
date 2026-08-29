/**
 * Fenced Thinking Scanner adapted from oh-my-pi.
 *
 * Tracks reasoning blocks in AI responses, including:
 * 1. Markdown code fences: ```thinking ... ```, ```thought ... ```, ```scratchpad ... ```
 * 2. XML tags: <think> ... </think>, <thinking> ... </thinking>, <scratchpad> ... </scratchpad>
 *
 * Handles nested code blocks (e.g. ```python ... ``` inside reasoning) so that
 * an inner closing fence does not prematurely close the thinking block.
 */

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const BACKTICK_LEAD = /^ {0,3}(`*)([\s\S]*)$/;
const LANG_TOKEN = /^[A-Za-z0-9_+#-]+$/;

const XML_OPEN_TAGS = ["<think>", "<thinking>", "<scratchpad>"];

export interface FencedThinkingResult {
  /** Thinking / reasoning text to emit for this chunk */
  thinking: string;
  /** Visible answer content to emit for this chunk */
  content: string;
  /** Whether the scanner is currently inside an active thinking block */
  inThinking: boolean;
}

/**
 * Stateful scanner for streaming deltas.
 */
export class FencedThinkingScanner {
  #buffer = "";
  #innerFence = "";
  #inThinking = false;
  #thinkingTagType: "fence" | "xml" | null = null;
  #activeXmlTag = "";

  /**
   * Feed a delta text chunk and return separated thinking vs visible content.
   */
  feed(text: string, final = false): FencedThinkingResult {
    this.#buffer += text;
    let thinking = "";
    let content = "";

    while (this.#buffer.length > 0) {
      if (!this.#inThinking) {
        // Look for XML open tag
        let xmlOpenIdx = -1;
        let matchedOpenTag = "";
        for (const tag of XML_OPEN_TAGS) {
          const idx = this.#buffer.toLowerCase().indexOf(tag);
          if (idx !== -1 && (xmlOpenIdx === -1 || idx < xmlOpenIdx)) {
            xmlOpenIdx = idx;
            matchedOpenTag = tag;
          }
        }

        // Look for Markdown fence open: ```thinking or ```thought or ```scratchpad
        const fenceMatch = this.#buffer.match(
          /(?:^|\n)[ \t]*```+(?:thinking|thought|scratchpad)[ \t]*(?:\n|$)/i
        );
        const fenceOpenIdx = fenceMatch ? fenceMatch.index! : -1;

        // Choose earliest opening marker
        if (xmlOpenIdx !== -1 && (fenceOpenIdx === -1 || xmlOpenIdx <= fenceOpenIdx)) {
          // Emit text before the tag as content
          content += this.#buffer.slice(0, xmlOpenIdx);
          this.#buffer = this.#buffer.slice(xmlOpenIdx + matchedOpenTag.length);
          this.#inThinking = true;
          this.#thinkingTagType = "xml";
          this.#activeXmlTag = matchedOpenTag.replace("<", "").replace(">", "");
          continue;
        }

        if (fenceOpenIdx !== -1) {
          const prefixLen = fenceMatch![0].startsWith("\n") ? 1 : 0;
          content += this.#buffer.slice(0, fenceOpenIdx + prefixLen);
          this.#buffer = this.#buffer.slice(fenceOpenIdx + fenceMatch![0].length);
          this.#inThinking = true;
          this.#thinkingTagType = "fence";
          this.#innerFence = "";
          continue;
        }

        // If no full open tag found, check if trailing part is a partial tag prefix
        if (!final) {
          const partialIdx = this.#findPartialTagPrefixIndex(this.#buffer);
          if (partialIdx !== -1) {
            content += this.#buffer.slice(0, partialIdx);
            this.#buffer = this.#buffer.slice(partialIdx);
            break;
          }
        }

        // Entire buffer is visible content
        content += this.#buffer;
        this.#buffer = "";
        break;
      }

      // We are inside thinking
      if (this.#thinkingTagType === "xml") {
        const closeTag = `</${this.#activeXmlTag}>`;
        const closeIdx = this.#buffer.toLowerCase().indexOf(closeTag);

        if (closeIdx !== -1) {
          thinking += this.#buffer.slice(0, closeIdx);
          this.#buffer = this.#buffer.slice(closeIdx + closeTag.length);
          this.#inThinking = false;
          this.#thinkingTagType = null;
          this.#activeXmlTag = "";
          continue;
        }

        // Check for partial close tag at end of buffer
        if (!final) {
          const partialCloseIdx = this.#findPartialXmlCloseIndex(this.#buffer, closeTag);
          if (partialCloseIdx !== -1) {
            thinking += this.#buffer.slice(0, partialCloseIdx);
            this.#buffer = this.#buffer.slice(partialCloseIdx);
            break;
          }
        }

        thinking += this.#buffer;
        this.#buffer = "";
        break;
      }

      if (this.#thinkingTagType === "fence") {
        const nl = this.#buffer.indexOf("\n");
        if (nl === -1) {
          if (final) {
            // End of stream inside fence
            const close = this.#closeRestFinal(this.#buffer);
            if (close !== undefined) {
              content += close;
              this.#inThinking = false;
              this.#thinkingTagType = null;
              this.#buffer = "";
            } else {
              thinking += this.#buffer;
              this.#buffer = "";
            }
          }
          break;
        }

        const line = this.#buffer.slice(0, nl);
        if (!this.#innerFence) {
          const close = this.#closeRest(line);
          if (close !== undefined) {
            // Closer consumed
            content += close + this.#buffer.slice(nl + 1);
            this.#buffer = "";
            this.#inThinking = false;
            this.#thinkingTagType = null;
            break;
          }
        }

        // Content line inside thinking
        thinking += this.#buffer.slice(0, nl + 1);
        this.#updateInner(line);
        this.#buffer = this.#buffer.slice(nl + 1);
      }
    }

    return {
      thinking,
      content,
      inThinking: this.#inThinking,
    };
  }

  /**
   * Flush any remaining buffer at end of stream.
   */
  flush(): FencedThinkingResult {
    return this.feed("", true);
  }

  #findPartialTagPrefixIndex(buf: string): number {
    const trailingLessThan = buf.lastIndexOf("<");
    if (trailingLessThan !== -1 && trailingLessThan >= buf.length - 12) {
      const candidate = buf.slice(trailingLessThan).toLowerCase();
      if (
        "<think>".startsWith(candidate) ||
        "<thinking>".startsWith(candidate) ||
        "<scratchpad>".startsWith(candidate)
      ) {
        return trailingLessThan;
      }
    }
    const trailingTicks = buf.lastIndexOf("`");
    if (trailingTicks !== -1 && trailingTicks >= buf.length - 16) {
      const candidate = buf.slice(trailingTicks).toLowerCase();
      if (
        "```thinking".startsWith(candidate) ||
        "```thought".startsWith(candidate) ||
        "```scratchpad".startsWith(candidate)
      ) {
        return trailingTicks;
      }
    }
    return -1;
  }

  #findPartialXmlCloseIndex(buf: string, closeTag: string): number {
    const trailingLessThan = buf.lastIndexOf("<");
    if (trailingLessThan !== -1 && trailingLessThan >= buf.length - closeTag.length) {
      const candidate = buf.slice(trailingLessThan).toLowerCase();
      if (closeTag.startsWith(candidate)) {
        return trailingLessThan;
      }
    }
    return -1;
  }

  #closeRest(line: string): string | undefined {
    const m = BACKTICK_LEAD.exec(line);
    if (!m || m[1]!.length < 3) return undefined;
    const rest = m[2]!;
    if (rest === "" || rest.trim() === "") return "";
    if (LANG_TOKEN.test(rest.trim())) return undefined;
    return rest;
  }

  #closeRestFinal(tail: string): string | undefined {
    const m = BACKTICK_LEAD.exec(tail);
    if (!m || m[1]!.length < 3) return undefined;
    const rest = m[2]!;
    return rest.trim() === "" ? "" : rest;
  }

  #updateInner(line: string): void {
    const fence = FENCE_LINE.exec(line);
    if (!fence) return;
    const run = fence[1]!;
    const info = fence[2]!.trim();
    if (!this.#innerFence) {
      this.#innerFence = run;
    } else if (
      run[0] === this.#innerFence[0] &&
      run.length >= this.#innerFence.length &&
      info === ""
    ) {
      this.#innerFence = "";
    }
  }
}

/**
 * Extract all leaked thinking/reasoning from a full non-streaming text response.
 */
export function extractFencedThinking(text: string): { content: string; thinking: string | null } {
  if (!text || typeof text !== "string") {
    return { content: text || "", thinking: null };
  }

  const scanner = new FencedThinkingScanner();
  const { thinking, content } = scanner.feed(text, true);

  const trimmedThinking = thinking.trim();
  return {
    content: content.trim(),
    thinking: trimmedThinking.length > 0 ? trimmedThinking : null,
  };
}
