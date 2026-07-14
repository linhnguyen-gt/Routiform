import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listChatsWithContent } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Archived Chats modal → "Export All Archived Chats". Unlike /chats/all, `getAllArchivedChats`
 * reads this with a plain `res.json()` — a regular JSON array, not ndjson.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const chats = listChatsWithContent({ archived: true });
  return Response.json(chats.map(chatToDto));
}
