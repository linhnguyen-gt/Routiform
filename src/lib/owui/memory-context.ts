/**
 * Feed stored memories to the model.
 *
 * Without this the Personalization panel is a write-only diary: the user adds "I prefer
 * TypeScript", the row lands in `owui_memories`, and no request ever reads it. Upstream injects
 * memories server-side (backend/open_webui/utils/middleware.py), and so must we — the SPA never
 * puts them in the request.
 *
 * Retrieval is "all of them", not a semantic top-k: Routiform ships no embedder, so there is
 * nothing to rank with. That is fine at the size a human types by hand, and it degrades honestly
 * — a hard cap below keeps a runaway memory list from eating the context window instead of
 * silently truncating the conversation.
 *
 * @module lib/owui/memory-context
 */

import { listMemories } from "@/lib/db/owui-memories";
import { getOwuiSettings } from "@/lib/db/owui-settings";

/** Roughly a few thousand tokens. Past this, memories are crowding out the actual conversation. */
const MAX_MEMORY_CHARS = 8_000;

interface RouterMessage {
  role: string;
  content: unknown;
}

/**
 * Whether the user turned Personalization on.
 *
 * Only consulted when the request did not say. The SPA nests its preferences under `ui` (it saves
 * `{ui: $settings}` and reads back `settings.set(userSettings.ui)`), so the flag is at
 * `ui.memory` — NOT at the top level. Reading the wrong depth here silently disables the feature.
 */
function memoryEnabled(): boolean {
  const settings = getOwuiSettings();
  const ui = settings.ui;
  if (typeof ui !== "object" || ui === null) return false;
  return (ui as Record<string, unknown>).memory === true;
}

/**
 * The system message carrying the user's memories, or null when there is nothing to say.
 *
 * Null — rather than an empty system message — because some providers reject a blank system turn,
 * and one that says "here is what you know: (nothing)" actively misleads the model.
 */
export function memorySystemMessage(enabled?: boolean): RouterMessage | null {
  if (!(enabled ?? memoryEnabled())) return null;

  const memories = listMemories();
  if (memories.length === 0) return null;

  // `continue`, not `break`. memories are newest-first, and a `break` on the first over-budget
  // entry discarded every memory after it — so one long memory near the front silently dropped all
  // the others, and a long one FIRST returned null, turning Personalization off with no signal.
  // Skipping the oversized entry keeps every memory that still fits, newest first (the best
  // relevance proxy we have without an embedder).
  const lines: string[] = [];
  let used = 0;
  for (const memory of memories) {
    const line = `- ${memory.content}`;
    if (used + line.length > MAX_MEMORY_CHARS) continue;
    lines.push(line);
    used += line.length;
  }
  if (lines.length === 0) return null;

  return {
    role: "system",
    content:
      "The user has asked you to remember the following about them. " +
      "Use it when relevant; do not bring it up unprompted.\n\n" +
      lines.join("\n"),
  };
}

/**
 * Put the memory system message in front of the conversation.
 *
 * `enabled` comes from the request's `features.memory` (Chat.svelte:2390) — the SPA already
 * resolved the toggle against its own defaults, so trusting it avoids a second, subtly different
 * answer to "is memory on?". It is optional because a client that omits `features` should still
 * get the user's stated preference rather than silently no memory.
 *
 * Prepended, not appended: a system turn after the user's question reads as an instruction about
 * that question rather than as standing context, and several providers only honour a system role
 * in the first position.
 */
export function withMemoryContext(messages: RouterMessage[], enabled?: boolean): RouterMessage[] {
  const memory = memorySystemMessage(enabled);
  return memory ? [memory, ...messages] : messages;
}
