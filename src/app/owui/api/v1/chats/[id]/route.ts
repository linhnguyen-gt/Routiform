import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteChat, getChat, saveChatContent, type OwuiChatContent } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Load a chat — the whole message tree, which is what the client renders from. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const chat = getChat((await params).id);
  if (!chat) {
    return createErrorResponse({ status: 404, message: "Chat not found", type: "invalid_request" });
  }

  return Response.json(chatToDto(chat));
}

/**
 * Save a chat. The client sends `{ chat: {...} }` with the COMPLETE tree, never a delta —
 * so the blob is replaced wholesale rather than merged.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const existing = getChat(id);
  if (!existing) {
    return createErrorResponse({ status: 404, message: "Chat not found", type: "invalid_request" });
  }

  let body: { chat?: unknown };
  try {
    body = (await request.json()) as { chat?: unknown };
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  // The client also PATCHes partial updates (chat params, a renamed title) through this same
  // endpoint, so a missing key means "unchanged", not "clear it".
  const incoming = (
    typeof body.chat === "object" && body.chat !== null ? body.chat : {}
  ) as Partial<OwuiChatContent> & {
    title?: unknown;
  };

  const merged: OwuiChatContent = { ...existing.chat, ...incoming };
  const title = typeof incoming.title === "string" ? incoming.title : undefined;

  saveChatContent(id, merged, title);

  const updated = getChat(id);
  return Response.json(updated ? chatToDto(updated) : null);
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  deleteChat((await params).id);
  return Response.json(true);
}
