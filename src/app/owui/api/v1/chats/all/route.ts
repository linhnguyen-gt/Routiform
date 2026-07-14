import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listChatsWithContent } from "@/lib/db/owui-chats";
import { chatToDto } from "@/lib/owui/chat-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings → Data Controls → Export Chats. The full backup, archived and unarchived alike —
 * `archived: "all"` is the tri-state exactly for this (see ListChatsOptions in owui-chats.ts).
 *
 * The client (`getAllChats` in apis/chats/index.ts) reads this as newline-delimited JSON via a
 * stream reader, NOT `res.json()` — a plain JSON array response makes it hang forever waiting
 * for a line boundary that never comes.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const chats = listChatsWithContent({ archived: "all" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chat of chats) {
        controller.enqueue(encoder.encode(`${JSON.stringify(chatToDto(chat))}\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
