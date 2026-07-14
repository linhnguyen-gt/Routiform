import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteAllMemories } from "@/lib/db/owui-memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `DELETE /owui/api/v1/memories/delete/user` — "Clear memory" in ManageModal.svelte. */
export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  deleteAllMemories();
  return Response.json({ success: true });
}
