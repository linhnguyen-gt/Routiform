"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/components";
import type { PendingAttachment } from "../hooks/use-attachments";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  attachments: PendingAttachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (sha256: string) => void;
  uploading: boolean;
  uploadError: string | null;
  /**
   * False when the selected model's target format discards image parts (cursor, devin,
   * commandcode — see open-sse/translator/image-support.ts). Image attach is then disabled
   * with a stated reason, because sending anyway would let the model answer confidently
   * about an image it never received.
   */
  supportsImages: boolean;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const TEXT_ACCEPT = ".txt,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.sh,.yml,.yaml";

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled = false,
  attachments,
  onAttach,
  onRemoveAttachment,
  uploading,
  uploadError,
  supportsImages,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // Return focus to the composer once a turn ends, so the next message can be
  // typed without reaching for the mouse.
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!streaming && (value.trim() || attachments.length > 0)) onSubmit();
    }
  };

  const acceptFiles = (files: File[]) => {
    if (files.length === 0) return;
    // The server re-checks this from the bytes; this is only to fail fast with a clear reason.
    const allowed = supportsImages ? files : files.filter((f) => !f.type.startsWith("image/"));
    if (allowed.length > 0) onAttach(allowed);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || streaming) return;
    acceptFiles(Array.from(event.dataTransfer.files));
  };

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);
  const accept = supportsImages ? `${IMAGE_ACCEPT},${TEXT_ACCEPT}` : TEXT_ACCEPT;

  return (
    <div
      className={`border-t border-border bg-surface p-3 ${dragging ? "ring-2 ring-inset ring-primary" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !streaming) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {attachments.map((attachment) => (
            <li
              key={attachment.sha256}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-subtle py-1 pl-2 pr-1 text-xs text-text-main"
            >
              {attachment.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a same-origin blob route, not a remote asset
                <img
                  src={`/api/attachments/${attachment.sha256}`}
                  alt=""
                  className="h-6 w-6 rounded object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  description
                </span>
              )}
              <span className="max-w-[160px] truncate">{attachment.filename}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.sha256)}
                aria-label={`Remove ${attachment.filename}`}
                className="rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-main"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []));
            // Reset so picking the same file twice still fires onChange.
            event.target.value = "";
          }}
        />

        <Button
          variant="secondary"
          icon="attach_file"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || streaming || uploading}
          title={
            supportsImages
              ? "Attach an image or text file"
              : "This model's format discards images. Text files only."
          }
          aria-label="Attach a file"
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder="Send a message…  (Enter to send, Shift+Enter for a newline)"
          aria-label="Message"
          className="max-h-40 min-h-[38px] flex-1 resize-y rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none disabled:opacity-50"
        />

        {streaming ? (
          <Button variant="secondary" icon="stop" onClick={onStop} title="Stop generating">
            Stop
          </Button>
        ) : (
          <Button icon="send" onClick={onSubmit} disabled={!canSend || uploading} title="Send">
            Send
          </Button>
        )}
      </div>

      {uploadError && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {uploadError}
        </p>
      )}

      {!supportsImages && (
        // Say why, not just "no". The reason is the translator, not the model — a vision-capable
        // model behind one of these formats still never receives the image.
        <p className="mt-1.5 text-[11px] text-text-muted">
          Images are unavailable for this model: its request format drops them before they reach the
          provider. Text files still work.
        </p>
      )}

      {streaming && (
        // Honest label. src/sse/handlers/chat.ts has no abort plumbing at all, so
        // the provider keeps generating — and billing — after Stop. Claiming
        // otherwise would be a lie the user pays for.
        <p className="mt-1.5 text-[11px] text-text-muted">
          Stop halts the response here. The provider may keep generating, and billing, until it
          finishes.
        </p>
      )}
    </div>
  );
}
