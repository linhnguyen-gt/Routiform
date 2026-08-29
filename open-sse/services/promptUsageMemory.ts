/**
 * Last prompt-side Anthropic usage.
 *
 * Nested Claude Code intercepts (web_search / web_fetch) replay this so fake
 * responses do not report input_tokens: 0.
 *
 * Main-stream message_start may reuse the last *same-conversation* snapshot so
 * DeepSeek/OpenAI tool turns do not bounce estimate → provider (26% → 36%).
 * Never key that seed on connectionId / "local" — those are account-wide and
 * survive Claude Code /new. Reject a snapshot that cannot belong to this
 * request (≤3 messages, or recalled tokens far from the current estimate).
 */

import {
  getLoggedInputTokens,
  getPromptCacheCreationTokens,
  getPromptCacheReadTokens,
} from "@/lib/usage/tokenAccounting";
import { isCompactSummarizerRequest, isNestedHelperRequest } from "./claudeCodeHelperCombo.ts";

export type PromptUsageSnapshot = {
  input_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

const TTL_MS = 30 * 60 * 1000;
/** /new and the first follow-up are 2–3 messages; tool loops are longer. */
const FRESH_CONVERSATION_MAX_MESSAGES = 3;
const RECALL_MAX_RATIO = 1.6;
const RECALL_MIN_RATIO = 0.65;
/**
 * Sweep-on-write keeps the store bounded in long-lived proxy processes without
 * a timer; the cap bounds growth inside one TTL window.
 */
const MAX_STORE_ENTRIES = 512;
const store = new Map<string, { at: number; usage: PromptUsageSnapshot }>();

function isFresh(at: number): boolean {
  return Date.now() - at < TTL_MS;
}

function sweepStore(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.at >= TTL_MS) store.delete(key);
  }
  if (store.size <= MAX_STORE_ENTRIES) return;
  const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldest.slice(0, store.size - MAX_STORE_ENTRIES)) {
    store.delete(key);
  }
}

export function toPromptUsageSnapshot(usage: unknown): PromptUsageSnapshot | null {
  if (!usage || typeof usage !== "object") return null;
  const cacheRead = getPromptCacheReadTokens(usage);
  const cacheCreate = getPromptCacheCreationTokens(usage);
  const total = getLoggedInputTokens(usage);
  if (total <= 0 && cacheRead <= 0 && cacheCreate <= 0) return null;
  const exclusive = Math.max(0, total - cacheRead - cacheCreate);
  const snapshot: PromptUsageSnapshot = { input_tokens: exclusive };
  if (cacheRead > 0) snapshot.cache_read_input_tokens = cacheRead;
  if (cacheCreate > 0) snapshot.cache_creation_input_tokens = cacheCreate;
  return snapshot;
}

/** Compact/REPL/title helpers must not overwrite the main-turn snapshot. */
export function shouldRememberPromptUsage(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  if (isNestedHelperRequest(record)) return false;
  if (isCompactSummarizerRequest(record)) return false;
  return true;
}

export function rememberPromptUsage(usage: unknown, keys: Array<string | null | undefined>): void {
  const snapshot = toPromptUsageSnapshot(usage);
  if (!snapshot) return;
  const at = Date.now();
  const names = [
    ...keys.filter((k): k is string => typeof k === "string" && k.length > 0),
    "local",
  ];
  sweepStore();
  for (const key of new Set(names)) {
    store.set(key, { at, usage: snapshot });
  }
}

function countMessages(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const messages = (body as { messages?: unknown }).messages;
  return Array.isArray(messages) ? messages.length : 0;
}

function snapshotPromptTokens(snapshot: PromptUsageSnapshot): number {
  return (
    Math.max(0, snapshot.input_tokens || 0) +
    Math.max(0, snapshot.cache_read_input_tokens || 0) +
    Math.max(0, snapshot.cache_creation_input_tokens || 0)
  );
}

/**
 * Same-conversation recall only. A 2-message /new request must not inherit
 * the previous chat's 200k snapshot via the shared DeepSeek account id.
 */
export function isPlausiblePromptUsageRecall(
  recalled: PromptUsageSnapshot,
  estimatedTokens: number,
  body: unknown
): boolean {
  const recalledTotal = snapshotPromptTokens(recalled);
  if (recalledTotal <= 0) return false;
  const messages = countMessages(body);
  if (messages > 0 && messages <= FRESH_CONVERSATION_MAX_MESSAGES) return false;
  if (estimatedTokens <= 0) return false;
  if (recalledTotal > estimatedTokens * RECALL_MAX_RATIO) return false;
  if (recalledTotal < estimatedTokens * RECALL_MIN_RATIO) return false;
  return true;
}

/**
 * Claude Code reads message_start immediately. Seeding that event with a
 * heuristic while message_delta later carries provider usage (exclusive +
 * cache_read) makes the meter bounce every DeepSeek/OpenAI turn — e.g. 26% → 36%.
 * Reuse the last same-conversation snapshot when it matches this request.
 * Compact still uses the tools+system floor so a successful compact can drop.
 */
export function buildPromptUsageSeed(options: {
  body: unknown;
  keys: Array<string | null | undefined>;
  estimatedTokens: number;
  estimatedFloorTokens: number;
}): { seed: PromptUsageSnapshot | null; compact: boolean } {
  const body =
    options.body && typeof options.body === "object"
      ? (options.body as Record<string, unknown>)
      : null;
  const compact = !!body && isCompactSummarizerRequest(body);
  const floor = options.estimatedFloorTokens;
  if (compact) {
    return { seed: floor > 0 ? { input_tokens: floor } : null, compact: true };
  }
  const estimated = options.estimatedTokens;
  const base = estimated > 0 ? estimated : floor;
  const recalled = recallPromptUsage(options.keys);
  if (recalled && isPlausiblePromptUsageRecall(recalled, base, body)) {
    const recalledTotal = snapshotPromptTokens(recalled);
    // GLM/Ollama often omit prompt usage, so a stale compact floor (10%) would
    // freeze the meter while the transcript grows. Only replay recall when it
    // is at least as large as this request's estimate (DeepSeek 26%→36% bounce).
    if (recalledTotal >= base) return { seed: recalled, compact: false };
  }
  return { seed: base > 0 ? { input_tokens: base } : null, compact: false };
}

export function recallPromptUsage(
  keys: Array<string | null | undefined> = []
): PromptUsageSnapshot | null {
  const names = [
    ...keys.filter((k): k is string => typeof k === "string" && k.length > 0),
    "local",
  ];
  for (const key of names) {
    const entry = store.get(key);
    if (entry && isFresh(entry.at)) return { ...entry.usage };
  }
  return null;
}

/**
 * Recall for nested web_search/web_fetch intercepts. Applies the same
 * same-conversation plausibility gate as message_start seeding so a fresh
 * /new conversation never replays the previous session's snapshot through the
 * account-wide fallback keys.
 */
export function recallPlausiblePromptUsage(options: {
  body: unknown;
  keys: Array<string | null | undefined>;
  estimatedTokens: number;
}): PromptUsageSnapshot | null {
  const recalled = recallPromptUsage(options.keys);
  if (!recalled) return null;
  if (!isPlausiblePromptUsageRecall(recalled, options.estimatedTokens, options.body)) {
    return null;
  }
  return recalled;
}

export function claudeUsageFromSnapshot(
  snapshot: PromptUsageSnapshot | null | undefined,
  outputTokens = 0
): Record<string, unknown> {
  const usage: Record<string, unknown> = {
    input_tokens: snapshot?.input_tokens ?? 0,
    output_tokens: outputTokens,
  };
  if (snapshot?.cache_read_input_tokens) {
    usage.cache_read_input_tokens = snapshot.cache_read_input_tokens;
  }
  if (snapshot?.cache_creation_input_tokens) {
    usage.cache_creation_input_tokens = snapshot.cache_creation_input_tokens;
  }
  return usage;
}
