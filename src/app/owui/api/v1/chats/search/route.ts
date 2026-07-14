import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listChats } from "@/lib/db/owui-chats";
import { chatListItemToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/** Sidebar / search modal title search. Scoped to unarchived chats, same as the plain chat list. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "";
  const pageParam = url.searchParams.get("page");
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;

  const items = listChats({
    archived: false,
    search: text,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return Response.json(items.map(chatListItemToDto));
}
