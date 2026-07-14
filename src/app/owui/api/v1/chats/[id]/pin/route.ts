import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getChat, updateChatMeta } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggles, not sets — the client sends no body and expects the flag to flip. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return createErrorResponse({ status: 404, message: "Chat not found", type: "invalid_request" });
  }

  updateChatMeta(id, { pinned: !chat.pinned });
  const updated = getChat(id);
  return Response.json(updated ? chatToDto(updated) : null);
}
