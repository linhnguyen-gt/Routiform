"use client";

import { useState } from "react";

import { Button } from "@/shared/components";
import type { Conversation } from "../hooks/use-conversations";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function conversationLabel(conversation: Conversation): string {
  return conversation.title.trim() || "New conversation";
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const commitRename = (id: string) => {
    const title = draftTitle.trim();
    if (title) onRename(id, title);
    setEditingId(null);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="p-3">
        <Button icon="add" onClick={onCreate} className="w-full">
          New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-muted">No conversations yet.</p>
        )}

        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId;

          return (
            <div
              key={conversation.id}
              className={`group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                isActive
                  ? "bg-primary/10 text-text-main"
                  : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {editingId === conversation.id ? (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitRename(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(conversation.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded border border-primary bg-bg-subtle px-1 py-0.5 text-sm text-text-main focus:outline-none"
                  aria-label="Conversation title"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className="flex-1 truncate text-left"
                    title={conversationLabel(conversation)}
                  >
                    {conversationLabel(conversation)}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(conversation.id);
                      setDraftTitle(conversation.title);
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title="Rename"
                    aria-label={`Rename ${conversationLabel(conversation)}`}
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title="Delete"
                    aria-label={`Delete ${conversationLabel(conversation)}`}
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
