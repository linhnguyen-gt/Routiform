import type { DedupBlock, DedupKey, DedupStore } from "./dedup-store.ts";
import { DEDUP_MAX_ROWS_PER_CONVERSATION } from "./dedup-store.ts";

/**
 * Durable dedup store backed by the app's SQLite database.
 *
 * Every statement names api_key_id and conversation_id explicitly. There is no "get by hash"
 * overload, because the moment one exists someone will call it and the result is one tenant's
 * content answering another tenant's lookup.
 *
 * Failures degrade to "no dedup" rather than propagating: this is an optimisation, and a store
 * that takes the request down with it when the disk is busy is worse than one that skips a saving.
 */

interface StatementLike {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

interface DbLike {
  prepare: (sql: string) => StatementLike;
}

export class SqliteDedupStore implements DedupStore {
  private getDb: () => DbLike | null;

  constructor(getDb: () => DbLike | null) {
    this.getDb = getDb;
  }

  private db(): DbLike | null {
    try {
      return this.getDb();
    } catch {
      return null;
    }
  }

  get(key: DedupKey): DedupBlock | null {
    const db = this.db();
    if (!db) return null;
    try {
      const row = db
        .prepare(
          `SELECT content, bytes FROM compression_dedup_blocks
           WHERE api_key_id = ? AND conversation_id = ? AND hash = ?`
        )
        .get(key.apiKeyId, key.conversationId, key.hash) as
        | { content: string; bytes: number }
        | undefined;
      if (!row) return null;
      return { ...key, content: row.content, bytes: row.bytes };
    } catch {
      return null;
    }
  }

  put(blocks: readonly DedupBlock[]): void {
    const db = this.db();
    if (!db || blocks.length === 0) return;
    const now = Date.now();
    try {
      const insert = db.prepare(
        `INSERT INTO compression_dedup_blocks
           (api_key_id, conversation_id, hash, content, bytes, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(api_key_id, conversation_id, hash)
         DO UPDATE SET last_seen_at = excluded.last_seen_at`
      );
      for (const block of blocks) {
        insert.run(
          block.apiKeyId,
          block.conversationId,
          block.hash,
          block.content,
          block.bytes,
          now,
          now
        );
      }
      for (const block of blocks) this.enforceCap(db, block);
    } catch {
      // A store write that fails simply means the next turn re-sends the block.
    }
  }

  touch(key: DedupKey): void {
    const db = this.db();
    if (!db) return;
    try {
      db.prepare(
        `UPDATE compression_dedup_blocks SET last_seen_at = ?
         WHERE api_key_id = ? AND conversation_id = ? AND hash = ?`
      ).run(Date.now(), key.apiKeyId, key.conversationId, key.hash);
    } catch {
      /* recency is an optimisation on an optimisation */
    }
  }

  sweep(olderThanMs: number): number {
    const db = this.db();
    if (!db) return 0;
    try {
      const result = db
        .prepare(`DELETE FROM compression_dedup_blocks WHERE last_seen_at < ?`)
        .run(Date.now() - olderThanMs) as { changes?: number };
      return result?.changes ?? 0;
    } catch {
      return 0;
    }
  }

  size(): number {
    const db = this.db();
    if (!db) return 0;
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM compression_dedup_blocks`).get() as
        | { n: number }
        | undefined;
      return row?.n ?? 0;
    } catch {
      return 0;
    }
  }

  /** Keep one long conversation from growing the table without bound. */
  private enforceCap(db: DbLike, key: DedupKey): void {
    try {
      db.prepare(
        `DELETE FROM compression_dedup_blocks
         WHERE api_key_id = ? AND conversation_id = ?
           AND hash NOT IN (
             SELECT hash FROM compression_dedup_blocks
             WHERE api_key_id = ? AND conversation_id = ?
             ORDER BY last_seen_at DESC
             LIMIT ?
           )`
      ).run(
        key.apiKeyId,
        key.conversationId,
        key.apiKeyId,
        key.conversationId,
        DEDUP_MAX_ROWS_PER_CONVERSATION
      );
    } catch {
      /* the cap is hygiene, not correctness */
    }
  }
}
