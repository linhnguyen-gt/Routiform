import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteAttachment, getAttachment } from "@/lib/db/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * File metadata. Deliberately does NOT return the blob — the SPA polls this while a file is
 * processing, and answering with the bytes would ship the whole image on every poll.
 *
 * The original filename is not stored (the blob store is content-addressed, and the same bytes
 * can arrive under many names), so `name` echoes the id. The SPA already holds the real name in
 * its own file item; this endpoint exists so the poll does not 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const attachment = getAttachment(id);
  if (!attachment) {
    return Response.json({ detail: "File not found" }, { status: 404 });
  }

  return Response.json({
    id: attachment.sha256,
    filename: attachment.sha256,
    meta: {
      name: attachment.sha256,
      content_type: attachment.mime,
      size: attachment.bytes,
    },
    created_at: Math.floor(attachment.createdAt / 1000),
  });
}

/**
 * Deleting a blob a chat still references is intentionally allowed — file-content.ts turns the
 * dangling reference into an "attachment ... is no longer available" note rather than corrupting
 * the transcript. The store is content-addressed, so this can also remove bytes backing
 * attachments in OTHER chats; that is accepted, not refcounted.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const attachment = getAttachment(id);
  if (!attachment) {
    return Response.json({ detail: "File not found" }, { status: 404 });
  }

  deleteAttachment(id);
  return Response.json(true);
}
