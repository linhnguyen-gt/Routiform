import { z } from "zod";
import { retrieveMemories } from "@/lib/memory/retrieval";
import { createMemory, deleteMemory, listMemories } from "@/lib/memory/store";
import { MemoryType } from "@/lib/memory/types";
import { memorySearchInput, memoryAddInput, memoryClearInput } from "../schemas/memory.ts";

export const memoryTools = {
  routiform_memory_search: {
    name: "routiform_memory_search",
    description: "Search memories by query, type, or API key with token budget enforcement",
    inputSchema: memorySearchInput,
    handler: async (args: z.infer<typeof memorySearchInput>) => {
      const config = {
        enabled: true,
        maxTokens: args.maxTokens || 2000,
        retrievalStrategy: "exact" as const,
        autoSummarize: false,
        persistAcrossModels: false,
        retentionDays: 30,
        scope: "apiKey" as const,
      };

      const memories = await retrieveMemories(args.apiKeyId, config);

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
    description: "Add a new memory entry",
    inputSchema: memoryAddInput,
    handler: async (args: z.infer<typeof memoryAddInput>) => {
      const memory = await createMemory({
        apiKeyId: args.apiKeyId,
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
    description: "Clear memories for an API key, optionally filtered by type or age",
    inputSchema: memoryClearInput,
    handler: async (args: z.infer<typeof memoryClearInput>) => {
      const memories = await listMemories({
        apiKeyId: args.apiKeyId,
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
