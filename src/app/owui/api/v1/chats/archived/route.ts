import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listChats } from "@/lib/db/owui-chats";
import { chatListItemToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/**
 * The Archived Chats modal's list. Mirrors `getArchivedChatList`'s `filter` shape
 * (`query`, `order_by`, `direction`), but only `query` maps to anything we can filter on —
 * ordering is always updated_at desc, which happens to be both fields' default.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;
  const query = url.searchParams.get("query") ?? undefined;

  const items = listChats({
    archived: true,
    search: query,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return Response.json(items.map(chatListItemToDto));
}
