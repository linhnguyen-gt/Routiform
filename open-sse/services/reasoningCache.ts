import { createRequire } from "module";

type AssistantMessageLike = {
  role?: unknown;
  tool_calls?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
};

const REASONING_REPLAY_PROVIDERS = new Set([
  "deepseek",
  "opencode-go",
  "siliconflow",
  "nebius",
  "deepinfra",
  "sambanova",
  "fireworks",
  "together",
]);

const REASONING_REPLAY_MODEL_PATTERNS = [
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /deepseek-chat/i,
  /deepseek-v4/i,
  /kimi-k2/i,
  /qwq/i,
  /qwen.*think/i,
  /glm.*think/i,
];

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 2000;
const DB_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const cache = new Map<
  string,
  { reasoning: string; provider: string; model: string; expiresAt: number; createdAt: number }
>();
let lastDbCleanupAt = 0;

const requireFromHere = createRequire(import.meta.url);

type ReasoningDbApi = {
  setReasoningCache: (
    toolCallId: string,
    provider: string,
    model: string,
    reasoning: string,
    ttlMs: number
  ) => void;
  getReasoningCache: (
    toolCallId: string,
    provider: string,
    model: string
  ) => { reasoning: string; provider: string; model: string } | null;
  cleanupExpiredReasoning: () => number;
  getReasoningCacheStats: () => {
    totalEntries: number;
    totalChars: number;
    byProvider: Record<string, { entries: number; chars: number }>;
    byModel: Record<string, { entries: number; chars: number }>;
    oldestEntry: string | null;
    newestEntry: string | null;
  };
  getReasoningCacheEntries: (opts?: {
    limit?: number;
    offset?: number;
    provider?: string;
    model?: string;
  }) => Array<{
    toolCallId: string;
    provider: string;
    model: string;
    reasoning: string;
    charCount: number;
    createdAt: string;
    expiresAt: string;
  }>;
  clearAllReasoningCache: (provider?: string) => number;
  deleteReasoningCache: (toolCallId: string, provider?: string, model?: string) => number;
};
let cachedDbApi: ReasoningDbApi | null | undefined;

export function isReasoningReplayEnabled(): boolean {
  const v = String(process.env.ROUTIFORM_REASONING_REPLAY || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function requiresReasoningReplay(provider: string, model: string): boolean {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const m = String(model || "").trim();
  if (REASONING_REPLAY_PROVIDERS.has(p)) return true;
  return REASONING_REPLAY_MODEL_PATTERNS.some((pattern) => pattern.test(m));
}

function evictOldestIfNeeded() {
  if (cache.size < MAX_MEMORY_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [key, value] of cache) {
    if (value.createdAt < oldestAt) {
      oldestAt = value.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
}

function toReasoning(message: AssistantMessageLike): string {
  if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }
  if (typeof message.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning;
  }
  return "";
}

function extractToolCallIds(message: AssistantMessageLike): string[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls
    .map((tc) => (tc && typeof tc === "object" && typeof tc.id === "string" ? tc.id : ""))
    .filter((id) => id.length > 0);
}

function buildScopedKey(toolCallId: string, provider: string, model: string): string {
  return `${String(provider || "")
    .trim()
    .toLowerCase()}::${String(model || "").trim()}::${toolCallId}`;
}

function setMemory(toolCallId: string, provider: string, model: string, reasoning: string) {
  evictOldestIfNeeded();
  cache.set(buildScopedKey(toolCallId, provider, model), {
    reasoning,
    provider,
    model,
    createdAt: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getReasoningDbApi(): ReasoningDbApi | null {
  if (cachedDbApi !== undefined) return cachedDbApi;
  try {
    cachedDbApi = requireFromHere("../../src/lib/db/reasoningCache.ts") as ReasoningDbApi;
  } catch {
    cachedDbApi = null;
  }
  return cachedDbApi;
}

function maybeCleanupDb() {
  const now = Date.now();
  if (now - lastDbCleanupAt < DB_CLEANUP_INTERVAL_MS) return;
  lastDbCleanupAt = now;
  try {
    getReasoningDbApi()?.cleanupExpiredReasoning();
  } catch {
    // best effort
  }
}

export function cacheReasoningFromAssistantMessage(
  message: AssistantMessageLike | null | undefined,
  provider: string,
  model: string
): number {
  if (!isReasoningReplayEnabled()) return 0;
  if (!requiresReasoningReplay(provider, model)) return 0;
  if (!message || message.role !== "assistant") return 0;

  const reasoning = toReasoning(message);
  if (!reasoning) return 0;
  const toolCallIds = extractToolCallIds(message);
  if (toolCallIds.length === 0) return 0;

  for (const toolCallId of toolCallIds) {
    setMemory(toolCallId, provider, model, reasoning);
    try {
      getReasoningDbApi()?.setReasoningCache(toolCallId, provider, model, reasoning, CACHE_TTL_MS);
      maybeCleanupDb();
    } catch {
      // DB persistence is best effort.
    }
  }
  return toolCallIds.length;
}

export function lookupReasoning(
  toolCallId: string,
  provider: string,
  model: string
): string | null {
  if (!isReasoningReplayEnabled() || !toolCallId) return null;
  pruneExpired();

  const local = cache.get(buildScopedKey(toolCallId, provider, model));
  if (local && local.expiresAt > Date.now()) return local.reasoning;

  try {
    const fromDb = getReasoningDbApi()?.getReasoningCache(toolCallId, provider, model);
    if (!fromDb?.reasoning) return null;
    setMemory(toolCallId, fromDb.provider, fromDb.model, fromDb.reasoning);
    return fromDb.reasoning;
  } catch {
    return null;
  }
}

export function getReasoningCacheServiceStats() {
  const dbApi = getReasoningDbApi();
  const dbStats = dbApi?.getReasoningCacheStats() ?? {
    totalEntries: 0,
    totalChars: 0,
    byProvider: {},
    byModel: {},
    oldestEntry: null,
    newestEntry: null,
  };
  pruneExpired();
  return {
    ...dbStats,
    memoryEntries: cache.size,
  };
}

export function getReasoningCacheServiceEntries(opts?: {
  limit?: number;
  offset?: number;
  provider?: string;
  model?: string;
}) {
  return getReasoningDbApi()?.getReasoningCacheEntries(opts) ?? [];
}

export function clearReasoningCacheAll(provider?: string): number {
  cache.clear();
  return getReasoningDbApi()?.clearAllReasoningCache(provider) ?? 0;
}

export function deleteReasoningCacheEntry(
  toolCallId: string,
  provider?: string,
  model?: string
): number {
  if (!toolCallId) return 0;
  if (provider && model) {
    cache.delete(buildScopedKey(toolCallId, provider, model));
  }
  return getReasoningDbApi()?.deleteReasoningCache(toolCallId, provider, model) ?? 0;
}
