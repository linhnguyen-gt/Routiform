/**
 * Turn stored attachment references into content a provider can actually read.
 *
 * Messages persist and travel as a hash reference — `/api/attachments/<sha256>` — never as
 * base64. That is not a style choice: useChat re-POSTs the ENTIRE message array on every turn,
 * proxy.ts caps bodies at 10 MB, and base64 inflates bytes ~33%. Inline four 2 MB photos and by
 * turn five the request is rejected before the route is even reached — the conversation is
 * bricked, unable to send, regenerate, or even summarize itself.
 *
 * So the bytes are loaded exactly once, here, on the way out to the provider.
 *
 * @module lib/chat/rehydrate-attachments
 */

import type { UIMessage } from "ai";

import { getAttachment } from "@/lib/db/chat";
import { toDataUrl } from "@/lib/chat/attachments";

const ATTACHMENT_URL = /^\/api\/attachments\/([a-f0-9]{64})$/;

/** How much of a text attachment is inlined before it is cut. */
const MAX_INLINED_TEXT_CHARS = 100_000;

type AnyPart = Record<string, unknown>;

function attachmentHash(part: AnyPart): string | null {
  if (part.type !== "file" || typeof part.url !== "string") return null;
  const match = ATTACHMENT_URL.exec(part.url);
  return match ? match[1] : null;
}

/**
 * Replace every stored-attachment reference with its real content.
 *
 * - An image becomes a `file` part carrying a data: URL, which every image-carrying translator
 *   in the matrix understands (see open-sse/translator/image-support.ts).
 * - A text file becomes a `text` part, inlined and fenced with its filename, because no
 *   translator has a text-attachment concept to map onto.
 * - A reference whose blob is missing degrades to a short text note. Dropping it silently would
 *   let the model answer about an image it never received.
 */
export function rehydrateAttachments(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    const parts = (message.parts ?? []) as AnyPart[];
    if (!parts.some((part) => attachmentHash(part))) return message;

    const rehydrated: AnyPart[] = [];

    for (const part of parts) {
      const sha256 = attachmentHash(part);
      if (!sha256) {
        rehydrated.push(part);
        continue;
      }

      const attachment = getAttachment(sha256);
      const filename = typeof part.filename === "string" ? part.filename : "attachment";

      if (!attachment) {
        rehydrated.push({
          type: "text",
          text: `[Attachment "${filename}" is no longer available.]`,
        });
        continue;
      }

      if (attachment.mime.startsWith("image/")) {
        rehydrated.push({
          type: "file",
          mediaType: attachment.mime,
          filename,
          url: toDataUrl(attachment.mime, attachment.data),
        });
        continue;
      }

      const decoded = attachment.data.toString("utf8");
      const text =
        decoded.length > MAX_INLINED_TEXT_CHARS
          ? `${decoded.slice(0, MAX_INLINED_TEXT_CHARS)}\n… [truncated]`
          : decoded;

      rehydrated.push({
        type: "text",
        text: `Attached file "${filename}":\n\n\`\`\`\n${text}\n\`\`\``,
      });
    }

    return { ...message, parts: rehydrated } as UIMessage;
  });
}
