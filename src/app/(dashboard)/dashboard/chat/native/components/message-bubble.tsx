"use client";

import { memo } from "react";
import type { UIMessage } from "ai";

import { MarkdownMessage } from "./markdown-message";
import { UsageBadge } from "./usage-badge";

/**
 * One turn.
 *
 * Renders `parts[]` through a switch rather than a flat string, because Phase 03
 * adds `file` parts to the same array and they must survive a reload.
 *
 * Memoized: useChat updates state on every token, and without this the entire
 * transcript re-renders (and re-highlights) per chunk.
 */

export interface MessageUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

interface MessageBubbleProps {
  message: UIMessage;
  streaming?: boolean;
  usage?: MessageUsage;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
}

function partText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming = false,
  usage,
  onRegenerate,
  onEdit,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = partText(message);

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={
            isUser
              ? "rounded-2xl rounded-br-sm border border-primary/20 bg-primary/10 px-3.5 py-2.5"
              : "rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-2.5"
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words text-sm text-text-main">{text}</p>
          ) : (
            <MarkdownMessage content={text} streaming={streaming} />
          )}

          {message.parts.map((part, index) =>
            part.type === "file" ? (
              <div
                key={index}
                className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs text-text-muted"
              >
                <span className="material-symbols-outlined text-[14px]">attach_file</span>
                {"filename" in part && typeof part.filename === "string"
                  ? part.filename
                  : "attachment"}
              </div>
            ) : null
          )}
        </div>

        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(text)}
            className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
            title="Copy"
            aria-label="Copy message"
          >
            <span className="material-symbols-outlined text-[15px]">content_copy</span>
          </button>

          {!isUser && onRegenerate && !streaming && (
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
              title="Regenerate"
              aria-label="Regenerate response"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
            </button>
          )}

          {isUser && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(text)}
              className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
              title="Edit and resend"
              aria-label="Edit and resend"
            >
              <span className="material-symbols-outlined text-[15px]">edit</span>
            </button>
          )}

          {!isUser && usage && <UsageBadge usage={usage} />}
        </div>
      </div>
    </div>
  );
});
