"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

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

interface LoadedConversation {
  conversation: Conversation;
  messages: UIMessage[];
  usage: Record<string, MessageUsage>;
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

/**
 * Loads the conversation, then hands it to ChatSession.
 *
 * The split is load-bearing, not cosmetic. `useChat` constructs its Chat object ONCE, in a
 * useRef on first render (@ai-sdk/react: `useRef("chat" in options ? options.chat : new
 * Chat(chatOptions))`, recreated only when `options.chat` or `options.id` changes). It never
 * syncs a later `messages` prop into state.
 *
 * So if ChatSession's hooks ran during the load, they would latch onto the empty pre-fetch
 * values forever: the transcript would render empty after every reload, and the model picker
 * would fall back to the catalog's first entry — which /api/chat then persists, silently
 * re-pointing the conversation at a different model at a different price.
 *
 * An early `return <Loading/>` does NOT fix that: hooks run before it. The hooks have to not
 * exist yet, which means a separate component.
 */
export function ChatPanel({ conversationId, onTitleInferred }: ChatPanelProps) {
  const [loaded, setLoaded] = useState<LoadedConversation | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadConversation(conversationId).then((data) => {
      if (cancelled || !data) return;

      setLoaded({
        conversation: data.conversation,
        messages: data.messages.map(toUIMessage),
        usage: Object.fromEntries(
          data.messages
            .filter((m) => m.inputTokens !== null || m.outputTokens !== null)
            .map((m) => [
              m.id,
              { inputTokens: m.inputTokens, outputTokens: m.outputTokens } satisfies MessageUsage,
            ])
        ),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Loading conversation…
      </div>
    );
  }

  return (
    <ChatSession
      // Remount on a different conversation so useChat is reconstructed with that
      // conversation's history rather than keeping the previous one's.
      key={conversationId}
      conversationId={conversationId}
      loaded={loaded}
      onTitleInferred={onTitleInferred}
    />
  );
}

interface ChatSessionProps {
  conversationId: string;
  loaded: LoadedConversation;
  onTitleInferred: (id: string, title: string) => void;
}

function ChatSession({ conversationId, loaded, onTitleInferred }: ChatSessionProps) {
  const { conversation, messages: persistedMessages, usage } = loaded;

  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(conversation.systemPrompt ?? "");
  // Open by default only when the conversation already has one — otherwise it is chrome the
  // user did not ask for. Phase 04 of the parity plan gives it a proper panel.
  const [showSystemPrompt, setShowSystemPrompt] = useState(
    (conversation.systemPrompt ?? "").length > 0
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const titledRef = useRef(conversation.title.trim().length > 0);

  // The persisted model/provider is authoritative, and by construction it is already here —
  // this component does not render until the conversation has loaded.
  const {
    options,
    model,
    setModel,
    provider,
    supportsImages,
    loading: modelsLoading,
  } = useChatModels({
    initialModel: conversation.model,
    initialProvider: conversation.provider,
  });

  const {
    attachments,
    add: addAttachments,
    remove: removeAttachment,
    clear: clearAttachments,
    uploading,
    uploadError,
  } = useAttachments();

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
      messages: persistedMessages,
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

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* A thin bar, not a toolbar. The model name reads as a label you can click, which is what
          makes the page feel like a chat rather than a form with a dropdown on top. */}
      <header className="flex shrink-0 items-center gap-2 px-4 py-2.5">
        <div className="relative">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            // Switching provider mid-stream would route the rest of the turn somewhere the
            // first half never went.
            disabled={streaming || modelsLoading}
            aria-label="Model"
            className="cursor-pointer appearance-none rounded-lg bg-transparent py-1 pl-2 pr-7 text-sm font-medium text-text-main outline-none transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            expand_more
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowSystemPrompt((open) => !open)}
          title="System prompt"
          aria-label="System prompt"
          aria-expanded={showSystemPrompt}
          className={`rounded-lg p-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
            systemPrompt ? "text-primary" : "text-text-muted"
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
      </header>

      {showSystemPrompt && (
        <div className="shrink-0 px-4 pb-2">
          <div className="mx-auto w-full max-w-3xl">
            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              onBlur={() => {
                void fetch(`/api/conversations/${conversationId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ systemPrompt: systemPrompt || null }),
                });
              }}
              rows={2}
              placeholder="System prompt (optional)"
              aria-label="System prompt"
              className="w-full resize-y rounded-xl border border-border bg-bg-subtle px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-text-muted">
            <span className="material-symbols-outlined mb-2 text-[40px] opacity-30">chat</span>
            <p className="text-sm">Send a message to start.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={streaming && isLast && message.role === "assistant"}
                  usage={usage[message.id]}
                  onRegenerate={
                    message.role === "assistant" && isLast ? () => void regenerate() : undefined
                  }
                  onEdit={
                    message.role === "user" ? (text) => handleEdit(message.id, text) : undefined
                  }
                />
              );
            })}

            {error && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {error.message}
              </p>
            )}

            <div ref={bottomRef} />
          </div>
        )}
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
