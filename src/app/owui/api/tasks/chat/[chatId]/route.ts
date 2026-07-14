import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listTaskIdsByChatId } from "@/lib/owui/chat-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which turns on this chat are still running — the client uses it to restore Stop on reload. */
export async function GET(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { chatId } = await context.params;
  return Response.json({ task_ids: listTaskIdsByChatId(chatId) });
}
