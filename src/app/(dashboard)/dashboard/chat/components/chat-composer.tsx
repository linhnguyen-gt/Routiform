"use client";

import { useEffect, useRef, useState } from "react";

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
   * False when the selected model's request format discards image parts (cursor, devin,
   * commandcode — see open-sse/translator/image-support.ts). Image attach is then disabled
   * with a stated reason, because sending anyway would let the model answer confidently
   * about an image it never received.
   */
  supportsImages: boolean;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const TEXT_ACCEPT = ".txt,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.sh,.yml,.yaml";

const MAX_TEXTAREA_HEIGHT = 200;

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

  // Return focus to the composer once a turn ends, so the next message can be typed
  // without reaching for the mouse.
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  // Grow with the content, up to a ceiling — then scroll inside. A fixed-height box that
  // scrolls from the second line is the tell of a form, not a chat.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

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

  const canSend = !disabled && !uploading && (value.trim().length > 0 || attachments.length > 0);
  const accept = supportsImages ? `${IMAGE_ACCEPT},${TEXT_ACCEPT}` : TEXT_ACCEPT;

  return (
    <div className="px-4 pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={`rounded-3xl border bg-surface shadow-sm transition-colors ${
            dragging ? "border-primary ring-2 ring-primary/20" : "border-border"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !streaming) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled || streaming) return;
            acceptFiles(Array.from(event.dataTransfer.files));
          }}
        >
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2 px-4 pt-3" aria-label="Attachments">
              {attachments.map((attachment) => (
                <li
                  key={attachment.sha256}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-bg-subtle py-1 pl-1.5 pr-1 text-xs text-text-main"
                >
                  {attachment.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a same-origin blob route
                    <img
                      src={`/api/attachments/${attachment.sha256}`}
                      alt=""
                      className="h-7 w-7 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined px-1 text-[18px] text-text-muted">
                      description
                    </span>
                  )}
                  <span className="max-w-[160px] truncate">{attachment.filename}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.sha256)}
                    aria-label={`Remove ${attachment.filename}`}
                    className="rounded-full p-0.5 text-text-muted hover:bg-black/10 hover:text-text-main dark:hover:bg-white/10"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-1 p-2">
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

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || streaming || uploading}
              title={
                supportsImages
                  ? "Attach an image or text file"
                  : "This model's format discards images. Text files only."
              }
              aria-label="Attach a file"
              className="mb-0.5 shrink-0 rounded-full p-2 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main disabled:opacity-40 dark:hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={disabled}
              placeholder="Send a message…"
              aria-label="Message"
              className="max-h-[200px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-relaxed text-text-main outline-none placeholder:text-text-muted disabled:opacity-50"
            />

            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop generating"
                aria-label="Stop generating"
                className="mb-0.5 shrink-0 rounded-full bg-text-main p-2 text-surface transition-opacity hover:opacity-80"
              >
                <span className="material-symbols-outlined text-[20px]">stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                title="Send"
                aria-label="Send"
                className="mb-0.5 shrink-0 rounded-full bg-text-main p-2 text-surface transition-opacity hover:opacity-80 disabled:opacity-25"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
              </button>
            )}
          </div>
        </div>

        {uploadError && (
          <p className="mt-2 text-center text-[11px] text-red-600 dark:text-red-400" role="alert">
            {uploadError}
          </p>
        )}

        {!supportsImages && (
          // Say why, not just "no". The reason is the translator, not the model — a vision-capable
          // model behind one of these formats still never receives the image.
          <p className="mt-2 text-center text-[11px] text-text-muted">
            Images are unavailable for this model: its request format drops them before they reach
            the provider. Text files still work.
          </p>
        )}

        {streaming && (
          // Honest label. src/sse/handlers/chat.ts has no abort plumbing at all, so the provider
          // keeps generating — and billing — after Stop. Claiming otherwise would be a lie the
          // user pays for.
          <p className="mt-2 text-center text-[11px] text-text-muted">
            Stop halts the response here. The provider may keep generating, and billing, until it
            finishes.
          </p>
        )}
      </div>
    </div>
  );
}
