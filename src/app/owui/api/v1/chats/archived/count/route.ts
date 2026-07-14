import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { countChats } from "@/lib/db/owui-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A bare number: `getArchivedChatCount` decrements the response value directly, not a `.count` field. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json(countChats({ archived: true }));
}
