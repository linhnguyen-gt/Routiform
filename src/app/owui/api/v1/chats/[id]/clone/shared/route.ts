import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createChat, getChat, type OwuiChatContent } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clones a chat the caller currently has shared, into a brand-new chat the caller owns.
 * 404s once the chat is unshared — same "link revoked" contract as GET /share/{share_id}.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const chat = getChat(id);
  if (!chat || !chat.shareId) {
    return createErrorResponse({
      status: 404,
      message: "Shared chat not found",
      type: "invalid_request",
    });
  }

  const clonedContent: OwuiChatContent = {
    ...chat.chat,
    originalChatId: chat.id,
    branchPointMessageId: chat.chat.history.currentId,
  };

  const cloned = createChat(clonedContent, `Clone of ${chat.title}`);
  return Response.json(chatToDto(cloned));
}
