import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { setArchivedForAll } from "@/lib/db/owui-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Data Controls → Archive All Chats. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  setArchivedForAll(true);
  return Response.json(true);
}
