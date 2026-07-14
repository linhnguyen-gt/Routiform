import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { abortTasksByChatId } from "@/lib/owui/chat-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Stop button once a chat has been saved — the client stops by chat id rather than by
 * task id (Chat.svelte:2724), because a saved chat can have several turns in flight.
 *
 * Same caveat as tasks/stop/[id]: this stops rendering, not upstream billing.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { chatId } = await context.params;

  // Not a 404 when nothing was running: the client fires this on every Stop, and a turn that
  // finished a moment earlier is not an error the user needs to see.
  return Response.json({ status: true, task_ids: abortTasksByChatId(chatId) });
}
