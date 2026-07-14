import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  importChat,
  type ImportChatInput,
  type OwuiChatContent,
  type OwuiHistory,
} from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";
import { deriveTitle } from "@/lib/owui/chat-tree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportBody {
  chats?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Timestamps arrive in SECONDS (it is our own export shape — see lib/owui/chat-dto.ts) and the
 * table stores milliseconds. Skipping the conversion would date every imported chat to 1970.
 *
 * Anything not a positive finite number falls back to "now" rather than writing a NaN or a
 * negative epoch into the column.
 */
function toMillis(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value * 1000);
}

/** A valid tree: an object keyed by message id, not the array shape a corrupt/hostile payload could send. */
function isValidHistory(value: unknown): value is OwuiHistory {
  if (!isRecord(value)) return false;
  const messages = value.messages;
  if (!isRecord(messages) || Array.isArray(messages)) return false;
  const currentId = value.currentId;
  return currentId === null || typeof currentId === "string";
}

function firstUserMessageContent(history: OwuiHistory): unknown {
  for (const message of Object.values(history.messages)) {
    if (isRecord(message) && message.role === "user") return message.content;
  }
  return undefined;
}

/**
 * The security boundary: this is arbitrary client-supplied JSON, most of it from a file the user
 * picked, potentially a converted ChatGPT export. Every entry must have a `chat` object with a
 * valid message tree before it is allowed anywhere near the database. `title` is not part of the
 * rejection criteria — a malformed/missing title is cosmetic, so it is derived instead.
 */
function toImportEntry(raw: unknown): ImportChatInput | null {
  if (!isRecord(raw) || !isRecord(raw.chat)) return null;

  const chat = raw.chat as Partial<OwuiChatContent> & { title?: unknown };
  if (!isValidHistory(chat.history)) return null;

  const content: OwuiChatContent = {
    ...chat,
    models: Array.isArray(chat.models) ? chat.models : [],
    history: chat.history,
  };

  const title =
    typeof chat.title === "string" && chat.title.trim() !== ""
      ? chat.title
      : deriveTitle(firstUserMessageContent(chat.history));

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    content,
    title,
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    folderId: typeof raw.folder_id === "string" ? raw.folder_id : null,
    createdAt: toMillis(raw.created_at),
    updatedAt: toMillis(raw.updated_at),
  };
}

/**
 * `importChats`: the client sends `{ chats: [...] }` where each entry is already normalised to
 * `{ chat, meta, pinned, folder_id, created_at, updated_at }` (DataControls.svelte's
 * `importChatsHandler`, fed either raw webui exports or `convertOpenAIChats` output).
 *
 * `meta` has no column to land in and is dropped. Everything else survives, timestamps included:
 * an import that restamped every chat with Date.now() would file a year of history under
 * "Today" in the sidebar and look like it had worked.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  if (!Array.isArray(body.chats)) {
    return createErrorResponse({
      status: 400,
      message: "`chats` must be an array",
      type: "invalid_request",
    });
  }

  // Malformed entries are skipped, not fatal: one bad conversation in a 500-chat export must not
  // cost the user the other 499. The response carries only what actually landed, so the SPA's
  // "imported N chats" is the true number.
  const imported = body.chats
    .map(toImportEntry)
    .filter((entry): entry is ImportChatInput => entry !== null)
    .map(importChat);

  return Response.json(imported.map(chatToDto));
}
