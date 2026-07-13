"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { Select } from "@/shared/components";
import { ChatComposer } from "./chat-composer";
import { MessageBubble, type MessageUsage } from "./message-bubble";
import { useChatModels } from "../hooks/use-chat-models";
import { useAttachments } from "../hooks/use-attachments";
import {
  loadConversation,
  type Conversation,
  type StoredMessage,
} from "../hooks/use-conversations";

interface ChatPanelProps {
  conversationId: string;
  onTitleInferred: (id: string, title: string) => void;
}

function toUIMessage(stored: StoredMessage): UIMessage {
  return {
    id: stored.id,
    role: stored.role,
    parts: stored.parts as UIMessage["parts"],
  };
}

/** First line of the first user turn, used to name an untitled conversation. */
function inferTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;

  const text = firstUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();

  if (!text) return null;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function ChatPanel({ conversationId, onTitleInferred }: ChatPanelProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [usageByMessage, setUsageByMessage] = useState<Record<string, MessageUsage>>({});
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const titledRef = useRef(false);

  // The persisted model/provider is authoritative. Seeding the picker from the
  // catalog instead would silently send the next turn to a different model at a
  // different price than the conversation was started with.
  const {
    options,
    model,
    setModel,
    provider,
    supportsImages,
    loading: modelsLoading,
  } = useChatModels({
    initialModel: conversation?.model,
    initialProvider: conversation?.provider,
  });

  const {
    attachments,
    add: addAttachments,
    remove: removeAttachment,
    clear: clearAttachments,
    uploading,
    uploadError,
  } = useAttachments();

  // The panel is remounted (key={conversationId}) whenever the conversation
  // changes, so this runs once per instance and needs no synchronous reset —
  // which would be a setState during commit and a cascading re-render.
  useEffect(() => {
    let cancelled = false;

    void loadConversation(conversationId).then((data) => {
      if (cancelled || !data) return;

      setConversation(data.conversation);
      setSystemPrompt(data.conversation.systemPrompt ?? "");
      setInitialMessages(data.messages.map(toUIMessage));
      titledRef.current = data.conversation.title.trim().length > 0;

      setUsageByMessage(
        Object.fromEntries(
          data.messages
            .filter((m) => m.inputTokens !== null || m.outputTokens !== null)
            .map((m) => [
              m.id,
              { inputTokens: m.inputTokens, outputTokens: m.outputTokens } satisfies MessageUsage,
            ])
        )
      );
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        body: () => ({ conversationId, model, provider }),
      }),
    [conversationId, model, provider]
  );

  const { messages, status, sendMessage, regenerate, stop, setMessages, error } =
    useChat<UIMessage>({
      // Remounting on conversation change is what loads the right history; the key
      // is set by the caller.
      messages: initialMessages ?? [],
      transport,
    });

  const streaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (titledRef.current || streaming) return;
    const title = inferTitle(messages);
    if (!title) return;
    titledRef.current = true;
    onTitleInferred(conversationId, title);
  }, [messages, streaming, conversationId, onTitleInferred]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    // An image with no caption is a legitimate turn ("what is this?" is implied), so an empty
    // textarea is only a blocker when there is nothing attached either.
    if ((!text && attachments.length === 0) || streaming) return;

    // Attachments travel as hash references. The bytes are pulled in server-side, once, when
    // the outbound provider request is built — never on the wire (lib/chat/rehydrate-attachments).
    const files = attachments.map((attachment) => ({
      type: "file" as const,
      mediaType: attachment.mime,
      filename: attachment.filename,
      url: `/api/attachments/${attachment.sha256}`,
    }));

    setInput("");
    clearAttachments();
    void sendMessage({ text, files });
  }, [input, attachments, streaming, sendMessage, clearAttachments]);

  const handleEdit = useCallback(
    (messageId: string, text: string) => {
      // Truncate at the edited turn and re-run from there, rather than appending
      // a second copy of the question.
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      setMessages(messages.slice(0, index));
      setInput(text);
    },
    [messages, setMessages]
  );

  if (initialMessages === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="min-w-[200px] flex-1">
          <Select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            options={options}
            // Switching provider mid-stream would route the rest of the turn
            // somewhere the first half never went.
            disabled={streaming || modelsLoading}
            aria-label="Model"
          />
        </div>

        <input
          type="text"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          onBlur={() => {
            void fetch(`/api/conversations/${conversationId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ systemPrompt: systemPrompt || null }),
            });
          }}
          placeholder="System prompt (optional)"
          aria-label="System prompt"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-bg-subtle px-3 py-1.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-text-muted">
            <span className="material-symbols-outlined mb-2 text-[40px] opacity-30">chat</span>
            <p className="text-sm">Send a message to start.</p>
          </div>
        )}

        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          return (
            <MessageBubble
              key={message.id}
              message={message}
              streaming={streaming && isLast && message.role === "assistant"}
              usage={usageByMessage[message.id]}
              onRegenerate={
                message.role === "assistant" && isLast ? () => void regenerate() : undefined
              }
              onEdit={message.role === "user" ? (text) => handleEdit(message.id, text) : undefined}
            />
          );
        })}

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error.message}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={() => void stop()}
        streaming={streaming}
        disabled={!model}
        attachments={attachments}
        onAttach={(files) => void addAttachments(files)}
        onRemoveAttachment={removeAttachment}
        uploading={uploading}
        uploadError={uploadError}
        supportsImages={supportsImages}
      />
    </div>
  );
}
