import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getChatByShareId } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The `/s/{share_id}` viewer's data source — session-gated, not a public share page. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ share_id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { share_id: shareId } = await params;
  const chat = getChatByShareId(shareId);
  if (!chat) {
    return createErrorResponse({
      status: 404,
      message: "Shared chat not found",
      type: "invalid_request",
    });
  }

  return Response.json(chatToDto(chat));
}
