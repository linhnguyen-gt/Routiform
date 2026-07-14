import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { unshareAllChats } from "@/lib/db/owui-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  unshareAllChats();
  return Response.json(true);
}
