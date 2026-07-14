import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listSharedChats, type OwuiChatListItem } from "@/lib/db/owui-chats";
import { chatListItemToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/**
 * Powers SharedChatsModal.svelte. `listSharedChats` always returns everything ordered by
 * updated_at DESC, so query/order_by/direction/paging are applied here rather than in the
 * DB layer, which has no search or sort parameters for this query.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;
  const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";
  const orderBy = url.searchParams.get("order_by") === "title" ? "title" : "updated_at";
  const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";

  let items: OwuiChatListItem[] = listSharedChats();
  if (query) {
    items = items.filter((item) => item.title.toLowerCase().includes(query));
  }
  items = [...items].sort((a, b) => {
    const cmp = orderBy === "title" ? a.title.localeCompare(b.title) : a.updated_at - b.updated_at;
    return direction === "asc" ? cmp : -cmp;
  });

  const offset = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(offset, offset + PAGE_SIZE);

  return Response.json(pageItems.map(chatListItemToDto));
}
