"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { ChatPanel } from "./components/chat-panel";
import { ConversationSidebar } from "./components/conversation-sidebar";
import { useChatModels } from "./hooks/use-chat-models";
import { useConversations } from "./hooks/use-conversations";

/**
 * Native chat.
 *
 * Lives at /dashboard/chat/native, NOT /dashboard/chat. The launcher page at
 * /dashboard/chat is the only caller of the Open WebUI start/stop/status routes
 * and there is no server-side autostart — overwriting it here would make Open
 * WebUI unstartable immediately, five phases before the parity gate that is
 * supposed to authorise its removal. Phase 04 is the commit that replaces it.
 */
export default function NativeChatPage() {
  const { conversations, create, rename, remove } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { model, provider, loading: modelsLoading } = useChatModels();

  // Derived, not synced. Falling back to the newest conversation in an effect
  // would mean a setState during render-commit and a cascading re-render; the
  // default is a pure function of the data we already have.
  const activeId = selectedId ?? conversations[0]?.id ?? null;

  const handleCreate = useCallback(async () => {
    if (!model) return;
    const conversation = await create({ model, provider });
    if (conversation) setSelectedId(conversation.id);
  }, [create, model, provider]);

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      // Clearing the explicit selection lets the derived fallback pick the next
      // conversation on its own.
      if (id === selectedId) setSelectedId(null);
    },
    [remove, selectedId]
  );

  const handleTitleInferred = useCallback(
    (id: string, title: string) => {
      void rename(id, title);
    },
    [rename]
  );

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-full flex-col overflow-hidden bg-bg">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 bg-surface px-3 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <span className="text-text-main">Chat</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          onRename={rename}
          onDelete={handleDelete}
        />

        {activeId ? (
          // Remount on conversation change so useChat picks up the right history.
          <ChatPanel
            key={activeId}
            conversationId={activeId}
            onTitleInferred={handleTitleInferred}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
            <span className="material-symbols-outlined text-[40px] opacity-30">forum</span>
            <p className="text-sm">
              {modelsLoading ? "Loading models…" : "Start a new chat to begin."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
