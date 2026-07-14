/**
 * Open WebUI "Personalization → Memories": free-text facts the user wants every chat to know.
 *
 * A separate table from the existing `memories` (migrations 015/021) ON PURPOSE. That one belongs
 * to the proxy: rows are scoped to an `api_key_id`, and `type` is CHECK-constrained to
 * factual/episodic/procedural/semantic. Open WebUI's memories are none of those — they are
 * user-authored strings with no key and no type. Forcing them into that table would mean
 * inventing a fake api_key_id and a fake type, and the two features would then corrupt each
 * other's rows the moment either changes its filter.
 *
 * Routiform has no embedder, so there is no semantic ranking here: retrieval is "all of them",
 * and lib/owui/memory-context.ts injects the lot as a system message.
 *
 * @module lib/db/owui-memories
 */

import crypto from "crypto";
import { getDbInstance } from "./core";

interface StatementLike<TRow = unknown> {
  all: (...params: unknown[]) => TRow[];
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
}

interface DbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
  exec: (sql: string) => void;
}

export interface OwuiMemory {
  id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

// Schema is declared here rather than in migrations/ for the same reason as owui-chats.ts:
// getDbInstance() builds an in-memory DB during `next build` WITHOUT running migrations, so a
// migration-only table does not exist at build time and every route touching it fails the build.
const OWUI_MEMORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS owui_memories (
    id         TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_owui_memories_created
    ON owui_memories(created_at DESC);
`;

let schemaReady = false;

function db(): DbLike {
  const instance = getDbInstance() as unknown as DbLike;
  if (schemaReady) return instance;
  instance.exec(OWUI_MEMORY_SCHEMA);
  schemaReady = true;
  return instance;
}

/** Reset the memoized flag. Tests only — a fresh in-memory DB needs a fresh exec. */
export function resetOwuiMemorySchemaCache(): void {
  schemaReady = false;
}

export function listMemories(): OwuiMemory[] {
  return db().prepare<OwuiMemory>(`SELECT * FROM owui_memories ORDER BY created_at DESC`).all();
}

export function addMemory(content: string): OwuiMemory {
  const now = Date.now();
  const memory: OwuiMemory = {
    id: crypto.randomUUID(),
    content,
    created_at: now,
    updated_at: now,
  };

  db()
    .prepare(`INSERT INTO owui_memories (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(memory.id, memory.content, now, now);

  return memory;
}

export function updateMemory(id: string, content: string): OwuiMemory | null {
  const result = db()
    .prepare(`UPDATE owui_memories SET content = ?, updated_at = ? WHERE id = ?`)
    .run(content, Date.now(), id);
  if ((result.changes ?? 0) === 0) return null;

  return db().prepare<OwuiMemory>(`SELECT * FROM owui_memories WHERE id = ?`).get(id) ?? null;
}

export function deleteMemory(id: string): boolean {
  const result = db().prepare(`DELETE FROM owui_memories WHERE id = ?`).run(id);
  return (result.changes ?? 0) > 0;
}

export function deleteAllMemories(): number {
  const result = db().prepare(`DELETE FROM owui_memories`).run();
  return result.changes ?? 0;
}
