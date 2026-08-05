import type { CavemanOutputTarget } from "./types.ts";

/**
 * Append a system-prompt directive to whichever system-ish field a request body actually carries.
 *
 * Extracted from `injectCavemanOutputDirective` so more than one directive can share the target
 * resolution. Every directive that ships through this seam gets the same shape handling and the
 * same prompt-cache placement; adding one is a call, not another copy of this ladder.
 *
 * Handles all four inbound request shapes this stage of the pipeline ever sees (one per source
 * format — compression runs on the pre-translation client body):
 *   - Claude Messages API: `body.system` (string or content-block array)
 *   - OpenAI-style: a `system` / `developer` message in `body.messages`
 *   - OpenAI Responses API (Codex CLI): `body.instructions` (string)
 *   - Gemini: `body.systemInstruction` (`{role?, parts:[{text}]}`), gated on the presence of
 *     `body.contents` (Gemini's messages-array field)
 * Falls back to prepending a new system message when none of the above is present.
 *
 * Returns the target it wrote to, or `null` when the body carries no recognizable system surface.
 */
export function appendSystemDirective(
  body: Record<string, unknown> | null | undefined,
  directive: string
): CavemanOutputTarget | null {
  if (!body || !directive) return null;

  if (typeof body.system === "string") {
    body.system = appendText(body.system, directive);
    return "system-field";
  }

  if (Array.isArray(body.system)) {
    insertTextBlock(body.system as unknown[], { type: "text", text: directive });
    return "system-field";
  }

  if (typeof body.instructions === "string") {
    body.instructions = appendText(body.instructions, directive);
    return "system-field";
  }

  if (Array.isArray(body.contents)) {
    const systemInstruction = body.systemInstruction;
    if (
      systemInstruction &&
      typeof systemInstruction === "object" &&
      Array.isArray((systemInstruction as Record<string, unknown>).parts)
    ) {
      ((systemInstruction as Record<string, unknown>).parts as unknown[]).push({ text: directive });
    } else {
      body.systemInstruction = { role: "user", parts: [{ text: directive }] };
    }
    return "system-field";
  }

  if (Array.isArray(body.messages)) {
    const messages = body.messages as Array<Record<string, unknown>>;
    const systemMsg = messages.find(
      (m) => m && typeof m === "object" && (m.role === "system" || m.role === "developer")
    );

    if (systemMsg && typeof systemMsg.content === "string") {
      systemMsg.content = appendText(systemMsg.content, directive);
      return "system-message";
    }
    if (systemMsg && Array.isArray(systemMsg.content)) {
      insertTextBlock(systemMsg.content as unknown[], { type: "text", text: directive });
      return "system-message";
    }
    if (systemMsg && systemMsg.content == null) {
      // Nothing to preserve — safe to set directly.
      systemMsg.content = directive;
      return "system-message";
    }
    if (systemMsg) {
      // Non-standard content shape (object/number/boolean, not string, array, or null): do not
      // clobber it. Prepend a new system message instead so the existing (unrecognized) content
      // survives untouched.
      messages.unshift({ role: "system", content: directive });
      return "new-system-message";
    }

    messages.unshift({ role: "system", content: directive });
    return "new-system-message";
  }

  return null;
}

function appendText(existing: string, addition: string): string {
  return existing.length > 0 ? `${existing}\n\n${addition}` : addition;
}

/**
 * Place a text block inside the Anthropic prompt-cache prefix when there is one.
 *
 * The cache covers everything up to and including the last `cache_control` marker. A block pushed
 * onto the end therefore sits outside that prefix and is re-sent, and re-billed, on every turn.
 * Inserting immediately before the last marker is the smallest move that lands inside it — the
 * block stays as late as it can, so any ordering the caller depends on is disturbed as little as
 * possible.
 *
 * The block itself carries no marker: it must not become a new cache boundary.
 */
function insertTextBlock(blocks: unknown[], block: Record<string, unknown>): void {
  let lastMarked = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const entry = blocks[i];
    if (entry && typeof entry === "object" && "cache_control" in (entry as object)) {
      lastMarked = i;
      break;
    }
  }

  if (lastMarked === -1) blocks.push(block);
  else blocks.splice(lastMarked, 0, block);
}
