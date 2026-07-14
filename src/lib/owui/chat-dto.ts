/**
 * The wire shape of a chat, as Open WebUI's client expects it.
 *
 * The one thing worth stating: **timestamps go out in SECONDS.** The client multiplies by
 * 1000 (`new Date(timestamp * 1000)` in utils/index.ts:1263), so handing it milliseconds dates
 * every chat to the year ~57000 and silently drops all of them out of the sidebar's
 * "Today"/"Yesterday" grouping. Routiform stores milliseconds everywhere else, so the
 * conversion lives here, at the boundary, rather than in the table.
 *
 * @module lib/owui/chat-dto
 */

import type { OwuiChat, OwuiChatListItem } from "@/lib/db/owui-chats";

/** The synthetic user every /owui row belongs to. See owui/api/v1/auths/session-user.ts. */
const OWUI_USER_ID = "routiform-local";

const toSeconds = (ms: number): number => Math.floor(ms / 1000);

export function chatToDto(chat: OwuiChat): Record<string, unknown> {
  return {
    id: chat.id,
    user_id: OWUI_USER_ID,
    title: chat.title,
    chat: chat.chat,
    updated_at: toSeconds(chat.updatedAt),
    created_at: toSeconds(chat.createdAt),
    share_id: chat.shareId,
    archived: chat.archived,
    pinned: chat.pinned,
    meta: {},
    folder_id: chat.folderId,
  };
}

export function chatListItemToDto(item: OwuiChatListItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    updated_at: toSeconds(item.updated_at),
    created_at: toSeconds(item.created_at),
    pinned: item.pinned,
    folder_id: item.folder_id,
    share_id: item.share_id,
  };
}
