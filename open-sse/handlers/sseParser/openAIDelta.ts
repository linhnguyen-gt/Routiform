import { appendTextPart } from "./textAccumulator.ts";
import { toRecord } from "./shared.ts";

/**
 * Accumulate OpenAI `delta.content` when it is a string, array of parts (Gemini/Cline), or a single object.
 * @see https://docs.cline.bot/api/chat-completions — reasoning may appear in `delta.reasoning` or structured content.
 */
function appendFromOpenAIDeltaContent(delta, contentParts, reasoningParts) {
  const d = toRecord(delta);
  const c = d.content;

  if (typeof c === "string" && c.length > 0) {
    appendTextPart(contentParts, c);
    return;
  }

  if (Array.isArray(c)) {
    for (const part of c) {
      if (typeof part === "string" && part.length > 0) {
        appendTextPart(contentParts, part);
        continue;
      }
      const block = toRecord(part);
      const bt = typeof block.type === "string" ? block.type.toLowerCase() : "";
      const chunk =
        (typeof block.text === "string" ? block.text : "") ||
        (typeof block.content === "string" ? block.content : "");
      if (!chunk) continue;
      if (!bt || bt === "text" || bt === "output_text" || bt === "text_delta") {
        appendTextPart(contentParts, chunk);
      } else if (
        bt.includes("reason") ||
        bt.includes("think") ||
        bt === "model_thought" ||
        bt === "thought"
      ) {
        appendTextPart(reasoningParts, chunk);
      }
    }
    return;
  }

  if (c && typeof c === "object" && !Array.isArray(c)) {
    const o = toRecord(c);
    if (typeof o.text === "string" && o.text.length > 0) appendTextPart(contentParts, o.text);
    else if (typeof o.content === "string" && o.content.length > 0)
      appendTextPart(contentParts, o.content);
  }
}

export { appendFromOpenAIDeltaContent };
