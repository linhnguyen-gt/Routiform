"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/shared/components";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled = false,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Return focus to the composer once a turn ends, so the next message can be
  // typed without reaching for the mouse.
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!streaming && value.trim()) onSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-surface p-3">
      <div className="flex items-end gap-2">
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
          <Button icon="send" onClick={onSubmit} disabled={disabled || !value.trim()} title="Send">
            Send
          </Button>
        )}
      </div>

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
