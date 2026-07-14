/**
 * Content-addressed blob store for chat attachments.
 *
 * Extracted from the deleted `lib/db/chat.ts` when the React chat was removed: the
 * conversation and message tables went with it, but the blobs did not. Open WebUI stores its
 * whole conversation in one JSON column (see ./owui-chats.ts) and references attachments by
 * id — and that id IS the sha256 here, so the same picture uploaded twice costs one row, and an
 * id cannot be forged into a reference to bytes that were never uploaded.
 *
 * Schema lives here rather than only in migration 026 because getDbInstance() builds an
 * in-memory DB during `next build` WITHOUT running migrations — a migration-only table does not
 * exist at build time, and every route touching it would fail the production build.
 *
 * @module lib/db/chat-attachments
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

export interface ChatAttachment {
  sha256: string;
  mime: string;
  bytes: number;
  data: Buffer;
  createdAt: number;
  filename: string;
}

/** What the Files modal lists. Same row minus the blob — a listing must never load the bytes. */
export type ChatAttachmentMeta = Omit<ChatAttachment, "data">;

const ATTACHMENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS chat_attachments (
    sha256     TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    data       BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

let schemaReady = false;

/**
 * Create the table if it is missing.
 *
 * Does NOT swallow the error: swallowing leaves schemaReady=false and the table absent, and
 * every subsequent prepare() throws a raw SQLITE_ERROR out of a route handler. Fail here, where
 * the cause is still legible.
 *
 * `filename` is ALTERed in rather than added to the schema string above: CREATE TABLE IF NOT
 * EXISTS is a no-op for anyone who already ran the app, so a column added to the string alone
 * would be missing on every existing database.
 */
function db(): DbLike {
  const instance = getDbInstance() as unknown as DbLike;
  if (schemaReady) return instance;
  instance.exec(ATTACHMENT_SCHEMA);

  const columns = instance
    .prepare<{ name: string }>(`PRAGMA table_info(chat_attachments)`)
    .all()
    .map((c) => c.name);
  if (!columns.includes("filename")) {
    instance.exec(`ALTER TABLE chat_attachments ADD COLUMN filename TEXT`);
  }

  schemaReady = true;
  return instance;
}

/** Reset the memoized flag. Tests only — a fresh in-memory DB needs a fresh exec. */
export function resetAttachmentSchemaCache(): void {
  schemaReady = false;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

export function putAttachment(data: Buffer, mime: string, filename = ""): ChatAttachment {
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const attachment: ChatAttachment = {
    sha256,
    mime,
    bytes: data.byteLength,
    data,
    createdAt: Date.now(),
    filename,
  };

  // Content-addressed: the same bytes uploaded twice store one row. Consequence for `filename`:
  // upload the same picture as a.png then b.png and the row keeps "a.png". Storing the bytes
  // twice to hold two names is the worse trade.
  db()
    .prepare(
      `INSERT OR IGNORE INTO chat_attachments (sha256, mime, bytes, data, created_at, filename)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sha256, mime, attachment.bytes, data, attachment.createdAt, filename);

  return attachment;
}

export function getAttachment(sha256: string): ChatAttachment | null {
  const row = db()
    .prepare<Record<string, unknown>>(`SELECT * FROM chat_attachments WHERE sha256 = ?`)
    .get(sha256);
  if (!row) return null;

  return {
    sha256: str(row.sha256),
    mime: str(row.mime),
    bytes: num(row.bytes),
    data: Buffer.isBuffer(row.data) ? row.data : Buffer.from([]),
    createdAt: num(row.created_at),
    filename: str(row.filename),
  };
}

function toMeta(row: Record<string, unknown>): ChatAttachmentMeta {
  return {
    sha256: str(row.sha256),
    mime: str(row.mime),
    bytes: num(row.bytes),
    createdAt: num(row.created_at),
    filename: str(row.filename),
  };
}

export function listAttachments(options: { search?: string } = {}): ChatAttachmentMeta[] {
  const term = options.search?.trim();
  if (!term) {
    return db()
      .prepare<Record<string, unknown>>(
        `SELECT sha256, mime, bytes, created_at, filename FROM chat_attachments
         ORDER BY created_at DESC`
      )
      .all()
      .map(toMeta);
  }

  return db()
    .prepare<Record<string, unknown>>(
      `SELECT sha256, mime, bytes, created_at, filename FROM chat_attachments
       WHERE filename LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC`
    )
    .all(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .map(toMeta);
}

export function countAttachments(): number {
  const row = db().prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM chat_attachments`).get();
  return row?.n ?? 0;
}

/**
 * Deleting a blob a chat still references is allowed and does NOT corrupt the transcript: the
 * message keeps its `files` entry, and lib/owui/file-content.ts turns the dangling reference
 * into an `[attachment ... is no longer available]` note (file-content.ts:49) rather than
 * dropping it — so the model is told the file is gone instead of answering as if it saw one.
 */
export function deleteAttachment(sha256: string): void {
  db().prepare(`DELETE FROM chat_attachments WHERE sha256 = ?`).run(sha256);
}

export function deleteAllAttachments(): number {
  const result = db().prepare(`DELETE FROM chat_attachments`).run();
  return result.changes ?? 0;
}
