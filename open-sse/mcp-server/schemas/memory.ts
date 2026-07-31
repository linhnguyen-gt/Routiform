import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

/**
 * Memory tool schemas live here rather than beside their handlers so the tool registry can
 * declare them without importing the memory store. `scopeEnforcement` imports the registry on
 * every call; pulling database code into that path would be a needless cost.
 */

const MEMORY_TYPE = z.enum(["factual", "episodic", "procedural", "semantic"]);

export const memorySearchInput = z.object({
  apiKeyId: z.string(),
  query: z.string().optional(),
  type: MEMORY_TYPE.optional(),
  maxTokens: z.number().int().positive().max(8000).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const memoryAddInput = z.object({
  apiKeyId: z.string(),
  sessionId: z.string().optional(),
  type: MEMORY_TYPE,
  key: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const memoryClearInput = z.object({
  apiKeyId: z.string(),
  type: MEMORY_TYPE.optional(),
  olderThan: z.string().optional(),
});

const memorySearchOutput = z.object({
  memories: z.array(z.unknown()),
  totalTokens: z.number().optional(),
});

const memoryAddOutput = z.object({
  id: z.string().optional(),
  created: z.boolean().optional(),
});

const memoryClearOutput = z.object({
  deleted: z.number().optional(),
});

export const memorySearchTool: McpToolDefinition<
  typeof memorySearchInput,
  typeof memorySearchOutput
> = {
  name: "routiform_memory_search",
  description: "Search memories by query, type, or API key with token budget enforcement",
  inputSchema: memorySearchInput,
  outputSchema: memorySearchOutput,
  scopes: ["read:memory"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/memory"],
};

export const memoryAddTool: McpToolDefinition<typeof memoryAddInput, typeof memoryAddOutput> = {
  name: "routiform_memory_add",
  description: "Add a new memory entry",
  inputSchema: memoryAddInput,
  outputSchema: memoryAddOutput,
  scopes: ["write:memory"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/memory"],
};

export const memoryClearTool: McpToolDefinition<typeof memoryClearInput, typeof memoryClearOutput> =
  {
    name: "routiform_memory_clear",
    description: "Clear memories for an API key, optionally filtered by type or age",
    inputSchema: memoryClearInput,
    outputSchema: memoryClearOutput,
    scopes: ["write:memory"],
    auditLevel: "full",
    phase: 2,
    sourceEndpoints: ["/api/memory", "/api/memory/[id]"],
  };
