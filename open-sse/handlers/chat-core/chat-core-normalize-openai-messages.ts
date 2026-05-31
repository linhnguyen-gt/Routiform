import { FORMATS } from "../../translator/formats.ts";
import { dedupeConsecutiveMessages } from "../../services/dedupeConsecutiveMessages.ts";
import { recordMessageDedupe } from "../../services/requestDedup.ts";
import type { HandlerLogger } from "../types/chat-core.ts";

/**
 * Pattern that matches the error text injected by clients (e.g. opencode) when a
 * prior model in the session did not support image input.  We strip these blocks
 * from the conversation history so they do not pollute requests to a new,
 * vision-capable model after the user switches mid-session.
 *
 * Matches strings like:
 *   ERROR: Cannot read "file.png" (this model does not support image input). Inform the user.
 */
const UNSUPPORTED_IMAGE_ERROR_PATTERN =
  /ERROR:\s*Cannot read\s+["']?[^"'\n]+["']?\s*\(this model does not support image input\)/i;

/**
 * OpenAI-style message normalization before translateRequest (non-passthrough branch).
 * Mutates `translatedBody` in place.
 */
export function normalizeOpenAiStyleMessagesForTranslation(
  translatedBody: Record<string, unknown>,
  targetFormat: string,
  log: HandlerLogger | null | undefined
): void {
  // Generic safety net: collapse adjacent duplicate user/tool messages that some
  // misbehaving clients/gateways emit (see plan 260531-1214-request-dedupe).
  // Conservative — only adjacent duplicates of user/tool roles are removed.
  if (Array.isArray(translatedBody.messages) && translatedBody.messages.length > 1) {
    const { messages: deduped, removed } = dedupeConsecutiveMessages(
      translatedBody.messages as Array<Record<string, unknown>>
    );
    if (removed > 0) {
      translatedBody.messages = deduped;
      recordMessageDedupe(removed);
      log?.info?.("DEDUP-MSG", `Collapsed ${removed} adjacent duplicate user/tool message(s)`);
    }
  }

  if (Array.isArray(translatedBody.messages)) {
    for (const msg of translatedBody.messages) {
      if (Array.isArray(msg.content)) {
        msg.content = (msg.content as Record<string, unknown>[]).filter(
          (block: Record<string, unknown>) => {
            if (block.type !== "text") return true;
            if (typeof block.text !== "string" || block.text.length === 0) return false;
            // Strip stale "unsupported image" error blocks injected by the client
            // when a prior model in the session had no vision capability.
            if (UNSUPPORTED_IMAGE_ERROR_PATTERN.test(block.text)) {
              log?.debug?.("NORM", "Stripped stale unsupported-image error block from history");
              return false;
            }
            return true;
          }
        );
      }
    }
  }

  const maybeParseJsonString = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed || !(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  };

  const isImageToolResultContent = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ((item as Record<string, unknown>).type === "image" ||
            (item as Record<string, unknown>).type === "image_url")
      );
    }

    const parsed = maybeParseJsonString(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const obj = parsed as Record<string, unknown>;
    const mimeType =
      (typeof obj.mimeType === "string" ? obj.mimeType : null) ||
      (typeof obj.mime_type === "string" ? obj.mime_type : null);
    return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
  };

  const extractImageToolResultPayload = (
    value: unknown
  ): { imageUrl: string; text: string } | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        if (record.type === "image_url") {
          const imageUrl =
            typeof record.image_url === "string"
              ? record.image_url
              : typeof (record.image_url as Record<string, unknown> | undefined)?.url === "string"
                ? String((record.image_url as Record<string, unknown>).url)
                : "";
          if (imageUrl) {
            return { imageUrl, text: "[Image attached from tool result]" };
          }
        }
        if (record.type === "image") {
          const source = record.source as Record<string, unknown> | undefined;
          const mediaType =
            typeof source?.media_type === "string" ? source.media_type : "image/png";
          const data = typeof source?.data === "string" ? source.data : "";
          if (data) {
            return {
              imageUrl: `data:${mediaType};base64,${data}`,
              text: "[Image attached from tool result]",
            };
          }
        }
      }
    }

    const parsed = maybeParseJsonString(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const mimeType =
      (typeof obj.mimeType === "string" ? obj.mimeType : null) ||
      (typeof obj.mime_type === "string" ? obj.mime_type : null);
    const base64Data = typeof obj.data === "string" ? obj.data : null;
    if (mimeType && base64Data && mimeType.toLowerCase().startsWith("image/")) {
      return {
        imageUrl: `data:${mimeType};base64,${base64Data}`,
        text:
          typeof obj.text === "string" && obj.text.trim()
            ? obj.text
            : "[Image attached from tool result]",
      };
    }
    return null;
  };

  if (Array.isArray(translatedBody.messages)) {
    for (const msg of translatedBody.messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        msg.content = (msg.content as Record<string, unknown>[]).flatMap(
          (block: Record<string, unknown>) => {
            if (block.type === "text" || block.type === "image_url" || block.type === "image") {
              return [block];
            }
            if (block.type === "file" || block.type === "document") {
              const fileContent =
                (block.file as Record<string, unknown>)?.content ??
                (block.file as Record<string, unknown>)?.text ??
                block.content ??
                block.text;
              const fileName =
                (block.file as Record<string, unknown>)?.name ?? block.name ?? "attachment";
              if (typeof fileContent === "string" && fileContent.length > 0) {
                return [{ type: "text", text: `[${fileName}]\n${fileContent}` }];
              }
              return [];
            }
            if (block.type === "tool_result") {
              const toolId = block.tool_use_id ?? block.id ?? "unknown";
              const resultContent = block.content ?? block.text ?? block.output ?? "";
              if (isImageToolResultContent(resultContent)) {
                return [block];
              }
              const resultText =
                typeof resultContent === "string"
                  ? resultContent
                  : Array.isArray(resultContent)
                    ? resultContent
                        .filter((c: Record<string, unknown>) => c.type === "text")
                        .map((c: Record<string, unknown>) => c.text)
                        .join("\n")
                    : JSON.stringify(resultContent);
              if (resultText.length > 0) {
                return [{ type: "text", text: `[Tool Result: ${toolId}]\n${resultText}` }];
              }
              return [];
            }
            log?.debug?.("CONTENT", `Dropped unsupported content part type="${block.type}"`);
            return [];
          }
        );
      }
    }
  }

  if (
    (targetFormat === FORMATS.OPENAI || targetFormat === FORMATS.OPENAI_RESPONSES) &&
    Array.isArray(translatedBody.messages)
  ) {
    const rewrittenMessages: Record<string, unknown>[] = [];
    for (const msg of translatedBody.messages as Record<string, unknown>[]) {
      rewrittenMessages.push(msg);
      if (msg.role !== "tool") continue;
      const imagePayload = extractImageToolResultPayload(msg.content);
      if (!imagePayload) continue;

      msg.content = imagePayload.text;
      rewrittenMessages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Use the attached image from the previous tool result when answering.",
          },
          {
            type: "image_url",
            image_url: { url: imagePayload.imageUrl },
          },
        ],
      });
    }
    translatedBody.messages = rewrittenMessages;
  }
}
