import { FencedThinkingScanner, extractFencedThinking } from "./fencedThinking.ts";

export interface HealedStreamChunk {
  content?: string;
  reasoning_content?: string;
}

/**
 * Live streaming healer for leaked reasoning markup in OpenAI SSE chunks.
 */
export class LeakedThinkingStreamHealer {
  #scanner = new FencedThinkingScanner();

  /**
   * Process incoming content delta. Returns array of healed deltas to emit.
   */
  feed(deltaContent: string, isFinal = false): HealedStreamChunk[] {
    if (!deltaContent && !isFinal) return [];

    const { thinking, content } = this.#scanner.feed(deltaContent, isFinal);
    const results: HealedStreamChunk[] = [];

    if (thinking) {
      results.push({ reasoning_content: thinking });
    }
    if (content) {
      results.push({ content });
    }

    return results;
  }

  /**
   * Flush any remaining held buffer at stream end.
   */
  flush(): HealedStreamChunk[] {
    return this.feed("", true);
  }
}

/**
 * Heal non-streaming message or response payload in-place.
 */
export function healNonStreamingPayload<T extends Record<string, unknown>>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;

  // 1. OpenAI ChatCompletion choice format
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (choice && typeof choice === "object") {
        const msg = (choice as Record<string, unknown>).message;
        if (msg && typeof msg === "object") {
          const message = msg as Record<string, unknown>;
          if (typeof message.content === "string" && message.content) {
            const { content, thinking } = extractFencedThinking(message.content);
            if (thinking) {
              message.content = content;
              if (!message.reasoning_content) {
                message.reasoning_content = thinking;
              } else if (typeof message.reasoning_content === "string") {
                message.reasoning_content = `${message.reasoning_content}\n\n${thinking}`;
              }
            }
          }
        }
      }
    }
  }

  // 2. Direct message object { role, content, reasoning_content }
  const raw = payload as Record<string, unknown>;
  if (typeof raw.content === "string" && raw.content) {
    const { content, thinking } = extractFencedThinking(raw.content);
    if (thinking) {
      raw.content = content;
      if (!raw.reasoning_content) {
        raw.reasoning_content = thinking;
      }
    }
  }

  return payload;
}
