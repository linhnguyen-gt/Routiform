import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { countAttachments } from "@/lib/db/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A bare integer, not `{ count }`: FilesModal.svelte does `fileCount = await getFileCount(...)`
 * and renders `{fileCount}` directly.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json(countAttachments());
}
