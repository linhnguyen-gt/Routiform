import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listChats } from "@/lib/db/owui-chats";
import { chatListItemToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const pinned = listChats({ limit: 200 }).filter((chat) => chat.pinned);
  return Response.json(pinned.map(chatListItemToDto));
}
