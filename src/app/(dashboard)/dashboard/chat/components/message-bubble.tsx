"use client";

import { memo, useState } from "react";
import type { UIMessage } from "ai";

import { isSafeImageSrc } from "@/lib/chat/markdown-safety";
import { MarkdownMessage } from "./markdown-message";
import { UsageBadge } from "./usage-badge";

/**
 * One turn.
 *
 * The user's turn sits in a bubble. The assistant's does NOT — it is bare text at full column
 * width, like Open WebUI and ChatGPT. Boxing both roles is the single thing that made this read
 * as "not like OpenAI": a bordered card around every answer turns a conversation into a form.
 *
 * Memoized: useChat updates state on every token, and without this the whole transcript
 * re-renders (and re-highlights) per chunk.
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

/** Attachments, rendered the same way for both roles. */
function FileParts({ message }: { message: UIMessage }) {
  const files = message.parts.filter((part) => part.type === "file");
  if (files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((part, index) => {
        const filename =
          "filename" in part && typeof part.filename === "string" ? part.filename : "attachment";
        const url = "url" in part && typeof part.url === "string" ? part.url : "";

        // Same origin policy as model-authored markdown. An assistant turn can carry file parts
        // too, and a remote <img> fires a GET on render — no click required.
        if (part.mediaType?.startsWith("image/") && isSafeImageSrc(url)) {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- a same-origin blob route
            <img
              key={index}
              src={url}
              alt={filename}
              className="max-h-64 rounded-xl border border-border object-contain"
            />
          );
        }

        return (
          <div
            key={index}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-subtle px-2 py-1 text-xs text-text-muted"
          >
            <span className="material-symbols-outlined text-[14px]">attach_file</span>
            {filename}
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/10"
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
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
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const actions = (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <ActionButton icon={copied ? "check" : "content_copy"} label="Copy" onClick={copy} />

      {!isUser && onRegenerate && !streaming && (
        <ActionButton icon="refresh" label="Regenerate" onClick={onRegenerate} />
      )}

      {isUser && onEdit && <ActionButton icon="edit" label="Edit" onClick={() => onEdit(text)} />}

      {!isUser && usage && <UsageBadge usage={usage} />}
    </div>
  );

  if (isUser) {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-bg-subtle px-4 py-2.5">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text-main">
            {text}
          </p>
          <FileParts message={message} />
        </div>
        {actions}
      </div>
    );
  }

  // The assistant answer: no border, no background, full column width.
  return (
    <div className="group flex flex-col gap-1">
      <MarkdownMessage content={text} streaming={streaming} />
      <FileParts message={message} />
      {actions}
    </div>
  );
});
