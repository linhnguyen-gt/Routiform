import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteAllAttachments } from "@/lib/db/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wipes every attachment, content-addressed store wide — this is not scoped to one chat, and any
 * chat still referencing a deleted blob degrades to an "attachment ... is no longer available"
 * note (lib/owui/file-content.ts) rather than breaking.
 */
export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  deleteAllAttachments();
  return Response.json(true);
}
