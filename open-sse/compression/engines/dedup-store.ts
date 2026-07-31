/**
 * Storage contract for Session-Dedup.
 *
 * Every operation takes the tenant AND the conversation. Neither is optional and neither has a
 * default: a store API that lets a caller omit `apiKeyId` is an API that will eventually be
 * called without it, and the failure mode is one tenant's block suppressing another's.
 */

export interface DedupKey {
  apiKeyId: string;
  conversationId: string;
  hash: string;
}

export interface DedupBlock extends DedupKey {
  content: string;
  bytes: number;
}

export interface DedupStore {
  /** The stored block for this key, or null. A miss must leave the request uncompressed. */
  get(key: DedupKey): DedupBlock | null;
  /** Record blocks seen for the first time. Only ever called after upstream accepted the request. */
  put(blocks: readonly DedupBlock[]): void;
  /** Refresh recency so an actively-referenced block is not swept out from under a conversation. */
  touch(key: DedupKey): void;
  /** Drop entries older than the TTL. Returns how many were removed. */
  sweep(olderThanMs: number): number;
  /** Rows currently held, for tests and instrumentation. */
  size(): number;
}

/** Blocks below this are not worth a lookup, let alone a marker. Tune from measurement. */
export const DEDUP_MIN_BLOCK_BYTES = 2 * 1024;

/** How long a block stays referenceable. A conversation idle longer than this starts fresh. */
export const DEDUP_TTL_MS = 6 * 60 * 60 * 1000;

/** Ceiling on rows per conversation, so one long session cannot grow the store without bound. */
export const DEDUP_MAX_ROWS_PER_CONVERSATION = 500;
