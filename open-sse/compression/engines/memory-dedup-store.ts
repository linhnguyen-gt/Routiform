import type { DedupBlock, DedupKey, DedupStore } from "./dedup-store.ts";
import { DEDUP_MAX_ROWS_PER_CONVERSATION } from "./dedup-store.ts";

/**
 * In-process dedup store.
 *
 * Used by tests, and usable as the durable store's front tier if lookups ever show on the hot
 * path. The composite key is built here rather than by callers so no call site can accidentally
 * assemble one without the tenant.
 */

interface Entry extends DedupBlock {
  createdAt: number;
  lastSeenAt: number;
}

function compositeKey(key: DedupKey): string {
  // The separator is a NUL so an id containing the separator cannot forge another tenant's key.
  return `${key.apiKeyId}\u0000${key.conversationId}\u0000${key.hash}`;
}

function conversationKey(key: DedupKey): string {
  return `${key.apiKeyId}\u0000${key.conversationId}`;
}

export class MemoryDedupStore implements DedupStore {
  private entries = new Map<string, Entry>();
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  get(key: DedupKey): DedupBlock | null {
    const entry = this.entries.get(compositeKey(key));
    if (!entry) return null;
    return {
      apiKeyId: entry.apiKeyId,
      conversationId: entry.conversationId,
      hash: entry.hash,
      content: entry.content,
      bytes: entry.bytes,
    };
  }

  put(blocks: readonly DedupBlock[]): void {
    const at = this.now();
    for (const block of blocks) {
      const id = compositeKey(block);
      const existing = this.entries.get(id);
      this.entries.set(id, {
        ...block,
        createdAt: existing?.createdAt ?? at,
        lastSeenAt: at,
      });
    }
    for (const block of blocks) this.enforceCap(block);
  }

  touch(key: DedupKey): void {
    const entry = this.entries.get(compositeKey(key));
    if (entry) entry.lastSeenAt = this.now();
  }

  sweep(olderThanMs: number): number {
    const cutoff = this.now() - olderThanMs;
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.lastSeenAt < cutoff) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  /** Evict the least recently seen rows once a conversation exceeds the cap. */
  private enforceCap(key: DedupKey): void {
    const prefix = conversationKey(key);
    const rows = [...this.entries.entries()].filter(([id]) => id.startsWith(`${prefix}\u0000`));
    if (rows.length <= DEDUP_MAX_ROWS_PER_CONVERSATION) return;
    rows
      .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)
      .slice(0, rows.length - DEDUP_MAX_ROWS_PER_CONVERSATION)
      .forEach(([id]) => this.entries.delete(id));
  }
}
