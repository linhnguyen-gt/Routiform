import { z } from "zod";
import { retrieveMemories } from "@/lib/memory/retrieval";
import { createMemory, deleteMemory, listMemories } from "@/lib/memory/store";
import { MemoryType } from "@/lib/memory/types";
import type { McpToolExtraLike } from "../scopeEnforcement.ts";
import { memorySearchInput, memoryAddInput, memoryClearInput } from "../schemas/memory.ts";

/**
 * Resolve the caller's own API key id from the session-bound authInfo the HTTP transport
 * binds after bearer-key validation. Memory tools are strictly per-key: there is no way to
 * address another key's memories.
 */
function requireCallerKeyId(extra?: McpToolExtraLike): string {
  const clientId = extra?.authInfo?.clientId;
  if (typeof clientId !== "string" || !clientId.trim()) {
    throw new Error(
      "Unauthorized: no authenticated API key identity bound to this session; memory tools are unavailable"
    );
  }
  return clientId;
}

export const memoryTools = {
  routiform_memory_search: {
    name: "routiform_memory_search",
    description:
      "Search the authenticated API key's own memories by query or type, with token budget enforcement",
    inputSchema: memorySearchInput,
    handler: async (args: z.infer<typeof memorySearchInput>, extra?: McpToolExtraLike) => {
      const apiKeyId = requireCallerKeyId(extra);
      const config = {
        enabled: true,
        maxTokens: args.maxTokens || 2000,
        retrievalStrategy: "exact" as const,
        autoSummarize: false,
        persistAcrossModels: false,
        retentionDays: 30,
        scope: "apiKey" as const,
      };

      const memories = await retrieveMemories(apiKeyId, config);

      const filtered = args.type ? memories.filter((m) => m.type === args.type) : memories;

      const limited = args.limit ? filtered.slice(0, args.limit) : filtered;

      return {
        success: true,
        data: {
          memories: limited,
          count: limited.length,
          totalTokens: limited.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
        },
      };
    },
  },

  routiform_memory_add: {
    name: "routiform_memory_add",
    description: "Add a memory entry scoped to the authenticated API key",
    inputSchema: memoryAddInput,
    handler: async (args: z.infer<typeof memoryAddInput>, extra?: McpToolExtraLike) => {
      const apiKeyId = requireCallerKeyId(extra);
      const memory = await createMemory({
        apiKeyId,
        sessionId: args.sessionId || "",
        type: args.type as MemoryType,
        key: args.key,
        content: args.content,
        metadata: args.metadata || {},
        expiresAt: null,
      });

      return {
        success: true,
        data: {
          memory,
          message: "Memory created successfully",
        },
      };
    },
  },

  routiform_memory_clear: {
    name: "routiform_memory_clear",
    description:
      "Clear the authenticated API key's own memories, optionally filtered by type or age",
    inputSchema: memoryClearInput,
    handler: async (args: z.infer<typeof memoryClearInput>, extra?: McpToolExtraLike) => {
      const apiKeyId = requireCallerKeyId(extra);
      const memories = await listMemories({
        apiKeyId,
        type: args.type as MemoryType | undefined,
      });

      let toDelete = memories;
      if (args.olderThan) {
        const cutoff = new Date(args.olderThan);
        toDelete = memories.filter((m) => new Date(m.createdAt) < cutoff);
      }

      let deletedCount = 0;
      for (const memory of toDelete) {
        await deleteMemory(memory.id);
        deletedCount++;
      }

      return {
        success: true,
        data: {
          deletedCount,
          message: `Cleared ${deletedCount} memories`,
        },
      };
    },
  },
};
