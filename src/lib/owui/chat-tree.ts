/**
 * The message tree Open WebUI's client keeps, and the linear history the router needs.
 *
 * The client does NOT send `messages` on a completion request — only the new `user_message`
 * and its `parent_id` (Chat.svelte:2589). Everything before that is expected to be
 * reconstructed HERE, by walking the stored tree. That is what makes branching work: an edit
 * or a regenerate creates a SIBLING under the same parent, and the conversation the model
 * sees is whichever path you walk, not whatever happens to be latest.
 *
 * @module lib/owui/chat-tree
 */

import type { OwuiChatContent, OwuiHistory, OwuiMessage } from "@/lib/db/owui-chats";
import { messageContent } from "@/lib/owui/file-content";

export interface RouterMessage {
  role: "user" | "assistant" | "system";
  content: unknown;
}

export function emptyHistory(): OwuiHistory {
  return { messages: {}, currentId: null };
}

export function emptyChatContent(models: string[]): OwuiChatContent {
  return { models, history: emptyHistory(), params: {}, files: [] };
}

/**
 * Insert a message and link it to its parent.
 *
 * `childrenIds` is appended to rather than replaced: a regenerate adds a second assistant
 * message under the SAME user turn, and clobbering the list would orphan the first branch —
 * the user's earlier answer would still be in the tree but unreachable from it.
 */
export function attachMessage(history: OwuiHistory, message: OwuiMessage): void {
  history.messages[message.id] = message;

  const parentId = message.parentId;
  if (!parentId) return;

  const parent = history.messages[parentId];
  if (!parent) return;

  if (!Array.isArray(parent.childrenIds)) parent.childrenIds = [];
  if (!parent.childrenIds.includes(message.id)) parent.childrenIds.push(message.id);
}

/**
 * Walk from `leafId` up to the root and return the path in conversation order.
 *
 * Guarded against cycles: a corrupted tree (a message that is its own ancestor) would
 * otherwise spin here forever, inside a request, holding the event loop.
 */
export function messagePath(history: OwuiHistory, leafId: string): OwuiMessage[] {
  const path: OwuiMessage[] = [];
  const seen = new Set<string>();

  let cursor: string | null = leafId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const message: OwuiMessage | undefined = history.messages[cursor];
    if (!message) break;
    path.push(message);
    cursor = message.parentId;
  }

  return path.reverse();
}

/**
 * The message list to send upstream.
 *
 * Assistant messages that never finished (`done !== true`, e.g. the placeholder for the turn
 * being generated right now, or a turn that crashed) are dropped: sending an empty assistant
 * turn invites the model to continue it, which is not what the user asked for.
 */
export function toRouterMessages(history: OwuiHistory, leafId: string): RouterMessage[] {
  return messagePath(history, leafId)
    .filter((m) => {
      // Only user turns and COMPLETED, non-empty assistant turns reach the provider.
      if (m.role === "user") return true;
      if (m.role === "assistant") return m.done === true && (m.content ?? "") !== "";
      // Anything else — notably `role: "system"` — is dropped. Legitimate system context is
      // injected separately (memory-context.ts), never stored in the tree, so a system message
      // in the walked path can only have arrived by import of a crafted file. Emitting it would
      // let that file plant a hidden, persistent instruction ("ignore all rules") in front of
      // every future turn. The chokepoint is here, not in import validation, so ALL paths are
      // covered by one rule.
      return false;
    })
    .map((m) => ({ role: m.role, content: messageContent(m) }));
}

/**
 * Has this conversation ever been answered?
 *
 * Used to decide whether a chat is still fresh enough to be auto-titled. The alternative — testing
 * the title against the string "New Chat" — breaks the moment the operator switches language, because
 * the SPA writes `$i18n.t('New Chat')`. This question has no such translation.
 */
export function hasAnswer(history: OwuiHistory): boolean {
  return Object.values(history.messages).some(
    (m) => m.role === "assistant" && m.done === true && (m.content ?? "") !== ""
  );
}

/** First line of the first user turn, for the sidebar. Upstream asks an LLM; this is free. */
export function deriveTitle(content: unknown): string {
  const text = typeof content === "string" ? content : "";
  const firstLine =
    text
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? "";
  if (firstLine === "") return "New Chat";
  return firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine;
}
