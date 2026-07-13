"use client";

import { useCallback, useEffect, useState } from "react";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string | null;
  systemPrompt: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  parts: unknown[];
  status: "streaming" | "complete" | "error" | "interrupted";
  model: string | null;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: Conversation[] };
      setConversations(data.conversations ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: { model: string; provider?: string | null }): Promise<Conversation | null> => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { conversation: Conversation };
      await refresh();
      return data.conversation;
    },
    [refresh]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  return { conversations, loading, refresh, create, rename, remove };
}

/** Load a conversation's persisted messages. Returns null while no id is selected. */
export async function loadConversation(
  id: string
): Promise<{ conversation: Conversation; messages: StoredMessage[] } | null> {
  const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as { conversation: Conversation; messages: StoredMessage[] };
}
