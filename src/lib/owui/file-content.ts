/**
 * Turn an Open WebUI message's attachments into content the model can actually read.
 *
 * The stored message tree holds only a REFERENCE (the attachment's sha256, which is also its
 * file id), and the bytes are loaded exactly once — here, on the way out to the provider. The
 * chat blob never carries base64, so a conversation with four photos in it does not grow past
 * what a request can hold and brick itself on turn five.
 *
 * @module lib/owui/file-content
 */

import { getAttachment } from "@/lib/db/chat-attachments";
import { toDataUrl } from "@/lib/chat/attachments";
import type { OwuiMessage } from "@/lib/db/owui-chats";

/** How much of a text attachment is inlined before it is cut. */
const MAX_INLINED_TEXT_CHARS = 100_000;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OwuiFile {
  id?: unknown;
  name?: unknown;
  type?: unknown;
}

/**
 * Build the OpenAI `content` for one message.
 *
 * Returns a plain string when there are no attachments — some providers are stricter about a
 * single-element array than they are about a bare string, and a text-only turn has no reason
 * to be wrapped.
 */
export function messageContent(message: OwuiMessage): unknown {
  const text = typeof message.content === "string" ? message.content : "";
  const files = Array.isArray(message.files) ? (message.files as OwuiFile[]) : [];
  if (files.length === 0) return text;

  const parts: ContentPart[] = [];

  for (const file of files) {
    const id = typeof file.id === "string" ? file.id : null;
    const name = typeof file.name === "string" ? file.name : "file";
    if (!id) continue;

    const attachment = getAttachment(id);
    if (!attachment) {
      // A missing blob degrades to a note rather than vanishing. Silently dropping it would
      // let the model answer confidently about a file it was never shown.
      parts.push({ type: "text", text: `[attachment "${name}" is no longer available]` });
      continue;
    }

    if (attachment.mime.startsWith("image/")) {
      parts.push({
        type: "image_url",
        image_url: { url: toDataUrl(attachment.mime, attachment.data) },
      });
      continue;
    }

    const body = attachment.data.toString("utf8").slice(0, MAX_INLINED_TEXT_CHARS);
    parts.push({ type: "text", text: `File: ${name}\n\n\`\`\`\n${body}\n\`\`\`` });
  }

  if (text !== "") parts.push({ type: "text", text });
  return parts.length > 0 ? parts : text;
}
