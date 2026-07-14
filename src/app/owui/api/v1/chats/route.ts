import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteAllChats, listChats } from "@/lib/db/owui-chats";
import { chatListItemToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/** The sidebar's chat list. `page` is 1-based upstream; absent means "everything". */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;

  const items = listChats({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return Response.json(items.map(chatListItemToDto));
}

/** Settings → Data Controls → Delete All Chats. Only reachable via DELETE on the collection. */
export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  deleteAllChats();
  return Response.json(true);
}
