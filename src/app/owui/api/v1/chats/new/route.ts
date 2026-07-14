import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createChat, type OwuiChatContent, type OwuiHistory } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";
import { deriveTitle, emptyHistory } from "@/lib/owui/chat-tree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NewChatBody {
  chat?: unknown;
  folder_id?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A valid tree: an object keyed by message id, not the array shape a corrupt client could send. */
function isValidHistory(value: unknown): value is OwuiHistory {
  if (!isRecord(value)) return false;
  const messages = value.messages;
  if (!isRecord(messages) || Array.isArray(messages)) return false;
  const currentId = value.currentId;
  return currentId === null || typeof currentId === "string";
}

/** First user message in the tree, for `deriveTitle` when the client didn't send one. */
function firstUserMessageContent(history: OwuiHistory): unknown {
  for (const message of Object.values(history.messages)) {
    if (message.role === "user") return message.content;
  }
  return undefined;
}

/**
 * `createNewChat`: the client always supplies the full content object (models, history, its own
 * `title`, `id`) rather than an empty shell — see Chat.svelte's `initChatHandler`. The `id` is
 * honoured when present because the client already navigated to `/c/{id}` before this call
 * resolves; minting a different id here would desync the URL from the stored chat.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: NewChatBody;
  try {
    body = (await request.json()) as NewChatBody;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  if (!isRecord(body.chat)) {
    return createErrorResponse({
      status: 400,
      message: "`chat` must be an object",
      type: "invalid_request",
    });
  }

  const incoming = body.chat as Partial<OwuiChatContent> & { title?: unknown; id?: unknown };
  const history = isValidHistory(incoming.history) ? incoming.history : emptyHistory();
  const content: OwuiChatContent = {
    ...incoming,
    models: Array.isArray(incoming.models) ? incoming.models : [],
    history,
  };

  const title =
    typeof incoming.title === "string" && incoming.title.trim() !== ""
      ? incoming.title
      : deriveTitle(firstUserMessageContent(history));

  const folderId = typeof body.folder_id === "string" ? body.folder_id : null;
  const id = typeof incoming.id === "string" && incoming.id.trim() !== "" ? incoming.id : undefined;

  const created = createChat(content, title, folderId, id);
  return Response.json(chatToDto(created));
}
