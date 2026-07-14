/**
 * The wire shape of an uploaded file, as Open WebUI's client expects it.
 *
 * One mapper, because three routes return this (`v1/files`, `v1/files/search`, `v1/files/[id]`)
 * and the SPA compares what it gets from the list against what it got from the upload. Three
 * hand-rolled copies drift, and the drift shows up as a file that renders with a name in one
 * panel and a hex hash in another.
 *
 * Timestamps go out in SECONDS — the client does `new Date(ts * 1000)`. Routiform stores
 * milliseconds, so the conversion belongs here, at the boundary.
 *
 * @module lib/owui/file-response
 */

import type { ChatAttachment, ChatAttachmentMeta } from "@/lib/db/chat-attachments";

export function attachmentToFileResponse(
  row: ChatAttachmentMeta | ChatAttachment
): Record<string, unknown> {
  // Rows written before the `filename` column existed have none. Falling back to the id keeps the
  // Files modal rendering something clickable instead of an empty cell.
  const name = row.filename || row.sha256;

  return {
    id: row.sha256,
    filename: name,
    meta: {
      name,
      content_type: row.mime,
      size: row.bytes,
    },
    created_at: Math.floor(row.createdAt / 1000),
  };
}
