import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getChat, shareChat, unshareChat } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Idempotent: re-sharing an already-shared chat returns the same link, never a rotated one. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return createErrorResponse({ status: 404, message: "Chat not found", type: "invalid_request" });
  }

  shareChat(id);
  const updated = getChat(id);
  return Response.json(updated ? chatToDto(updated) : null);
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return createErrorResponse({ status: 404, message: "Chat not found", type: "invalid_request" });
  }

  unshareChat(id);
  return Response.json(true);
}
