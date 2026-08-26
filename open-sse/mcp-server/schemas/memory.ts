import { z } from "zod";
import type { McpToolDefinition } from "./tools.ts";

/**
 * Memory tool schemas live here rather than beside their handlers so the tool registry can
 * declare them without importing the memory store. `scopeEnforcement` imports the registry on
 * every call; pulling database code into that path would be a needless cost.
 *
 * None of these inputs take an apiKeyId: the caller's key identity is resolved server-side
 * from the authenticated session (extra.authInfo), never from caller-supplied arguments.
 */

const MEMORY_TYPE = z.enum(["factual", "episodic", "procedural", "semantic"]);

export const memorySearchInput = z.object({
  query: z.string().optional(),
  type: MEMORY_TYPE.optional(),
  maxTokens: z.number().int().positive().max(8000).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const memoryAddInput = z.object({
  sessionId: z.string().optional(),
  type: MEMORY_TYPE,
  key: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const memoryClearInput = z.object({
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
  description:
    "Search the authenticated API key's own memories by query or type, with token budget enforcement",
  inputSchema: memorySearchInput,
  outputSchema: memorySearchOutput,
  scopes: ["read:memory"],
  auditLevel: "basic",
  phase: 2,
  sourceEndpoints: ["/api/memory"],
};

export const memoryAddTool: McpToolDefinition<typeof memoryAddInput, typeof memoryAddOutput> = {
  name: "routiform_memory_add",
  description: "Add a memory entry scoped to the authenticated API key",
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
    description:
      "Clear the authenticated API key's own memories, optionally filtered by type or age",
    inputSchema: memoryClearInput,
    outputSchema: memoryClearOutput,
    scopes: ["write:memory"],
    auditLevel: "full",
    phase: 2,
    sourceEndpoints: ["/api/memory", "/api/memory/[id]"],
  };
