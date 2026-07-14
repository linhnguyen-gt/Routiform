/**
 * Open WebUI chat persistence.
 *
 * ONE JSON column holds the whole conversation, exactly as upstream does
 * (backend/open_webui/models/chats.py:50). That is not laziness — the frontend owns a message
 * TREE (`history.messages` keyed by id, with `parentId`/`childrenIds`/`currentId`), and
 * branching, edit-siblings and regenerate-siblings are all just shapes of that tree. Storing
 * it as rows would mean re-deriving the tree on every read and re-normalising it on every
 * write, for no query we actually run: nothing here ever searches inside a conversation.
 *
 * This table is NOT the native chat's (`chat_conversations` / `chat_messages` in ./chat.ts).
 * The two chats coexist until the React one is deleted, and they must not share storage —
 * their message models are incompatible (flat rows with `parts` vs. a tree with `content`).
 *
 * @module lib/db/owui-chats
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

/**
 * Add a column that a previously-shipped database does not have.
 *
 * `CREATE TABLE IF NOT EXISTS` below is a no-op against an existing table, so a column added
 * to the schema string is silently absent for every user who already ran the app — and the
 * first query naming it throws SQLITE_ERROR from inside a route handler. PRAGMA first, ALTER
 * only if missing: `ALTER TABLE ... ADD COLUMN` has no IF NOT EXISTS form in SQLite.
 */
function addColumnIfMissing(instance: DbLike, table: string, column: string, decl: string): void {
  const columns = instance
    .prepare<{ name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
  if (!columns.includes(column)) {
    instance.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/** One node of the frontend's message tree. Extra fields it sends are preserved verbatim. */
export interface OwuiMessage {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  done?: boolean;
  timestamp?: number;
  files?: unknown[];
  [key: string]: unknown;
}

export interface OwuiHistory {
  messages: Record<string, OwuiMessage>;
  currentId: string | null;
}

/** The JSON blob. `history` is the tree; the rest is what the frontend hands back on save. */
export interface OwuiChatContent {
  models: string[];
  history: OwuiHistory;
  params?: Record<string, unknown>;
  files?: unknown[];
  [key: string]: unknown;
}

export interface OwuiChat {
  id: string;
  title: string;
  chat: OwuiChatContent;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  pinned: boolean;
  folderId: string | null;
  /** Non-null once the chat has been shared. Also the lookup key for the share view. */
  shareId: string | null;
}

// Mirrors ./chat.ts: the schema is duplicated here rather than left to a migration because
// getDbInstance() builds an in-memory DB during `next build` WITHOUT running migrations, and a
// migration-only table therefore does not exist at build time — every route touching it would
// fail the production build.
const OWUI_CHAT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS owui_chats (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    chat       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived   INTEGER NOT NULL DEFAULT 0,
    pinned     INTEGER NOT NULL DEFAULT 0,
    folder_id  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_owui_chats_updated
    ON owui_chats(updated_at DESC);
`;

let schemaReady = false;

function db(): DbLike {
  const instance = getDbInstance() as unknown as DbLike;
  if (schemaReady) return instance;
  instance.exec(OWUI_CHAT_SCHEMA);
  addColumnIfMissing(instance, "owui_chats", "share_id", "TEXT");
  instance.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_owui_chats_share ON owui_chats(share_id)
     WHERE share_id IS NOT NULL`
  );
  schemaReady = true;
  return instance;
}

/** Reset the memoized flag. Tests only — a fresh in-memory DB needs a fresh exec. */
export function resetOwuiChatSchemaCache(): void {
  schemaReady = false;
}

interface OwuiChatRow {
  id: string;
  title: string;
  chat: string;
  created_at: number;
  updated_at: number;
  archived: number;
  pinned: number;
  folder_id: string | null;
  share_id: string | null;
}

function toChat(row: OwuiChatRow): OwuiChat {
  return {
    id: row.id,
    title: row.title,
    chat: JSON.parse(row.chat) as OwuiChatContent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
    pinned: row.pinned === 1,
    folderId: row.folder_id,
    shareId: row.share_id ?? null,
  };
}

export function createChat(
  content: OwuiChatContent,
  title: string,
  folderId?: string | null,
  id?: string
): OwuiChat {
  const now = Date.now();
  const chat: OwuiChat = {
    id: id ?? crypto.randomUUID(),
    title,
    chat: content,
    createdAt: now,
    updatedAt: now,
    archived: false,
    pinned: false,
    folderId: folderId ?? null,
    shareId: null,
  };

  db()
    .prepare(
      `INSERT INTO owui_chats (id, title, chat, created_at, updated_at, archived, pinned, folder_id)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
    )
    .run(chat.id, chat.title, JSON.stringify(content), now, now, chat.folderId);

  return chat;
}

export interface ImportChatInput {
  id?: string;
  title: string;
  content: OwuiChatContent;
  folderId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  pinned?: boolean;
}

/**
 * Insert a chat that already has a history — an Open WebUI export, or a converted ChatGPT one.
 *
 * Separate from createChat() because it must preserve the ORIGINAL timestamps. Stamping Date.now()
 * on an import (which is all createChat can do) dates a year of history to today, and the sidebar
 * then files every one of those conversations under "Today" — the import looks like it worked and
 * the history is quietly flattened.
 *
 * An id collision falls back to a fresh one rather than overwriting: importing a file twice must
 * not silently clobber a chat the user has since continued.
 */
export function importChat(input: ImportChatInput): OwuiChat {
  const now = Date.now();
  const requestedId = input.id;
  const id = requestedId && !getChat(requestedId) ? requestedId : crypto.randomUUID();

  const chat: OwuiChat = {
    id,
    title: input.title,
    chat: input.content,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    archived: input.archived ?? false,
    pinned: input.pinned ?? false,
    folderId: input.folderId ?? null,
    shareId: null,
  };

  db()
    .prepare(
      `INSERT INTO owui_chats (id, title, chat, created_at, updated_at, archived, pinned, folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      chat.id,
      chat.title,
      JSON.stringify(chat.chat),
      chat.createdAt,
      chat.updatedAt,
      chat.archived ? 1 : 0,
      chat.pinned ? 1 : 0,
      chat.folderId
    );

  return chat;
}

export function getChat(id: string): OwuiChat | null {
  const row = db().prepare<OwuiChatRow>(`SELECT * FROM owui_chats WHERE id = ?`).get(id);
  return row ? toChat(row) : null;
}

export function getChatByShareId(shareId: string): OwuiChat | null {
  const row = db().prepare<OwuiChatRow>(`SELECT * FROM owui_chats WHERE share_id = ?`).get(shareId);
  return row ? toChat(row) : null;
}

/** Idempotent: re-sharing an already-shared chat returns the existing id, it does not rotate it. */
export function shareChat(id: string): string | null {
  const chat = getChat(id);
  if (!chat) return null;
  if (chat.shareId) return chat.shareId;

  const shareId = crypto.randomUUID();
  db().prepare(`UPDATE owui_chats SET share_id = ? WHERE id = ?`).run(shareId, id);
  return shareId;
}

export function unshareChat(id: string): void {
  db().prepare(`UPDATE owui_chats SET share_id = NULL WHERE id = ?`).run(id);
}

export function unshareAllChats(): number {
  const result = db()
    .prepare(`UPDATE owui_chats SET share_id = NULL WHERE share_id IS NOT NULL`)
    .run();
  return result.changes ?? 0;
}

export function listSharedChats(): OwuiChatListItem[] {
  const rows = db()
    .prepare<OwuiChatListRow>(
      `SELECT id, title, updated_at, created_at, pinned, folder_id, share_id
       FROM owui_chats
       WHERE share_id IS NOT NULL
       ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(toListItem);
}

/** Replaces the blob wholesale. The frontend always sends the complete tree, never a delta. */
export function saveChatContent(id: string, content: OwuiChatContent, title?: string): void {
  const now = Date.now();
  if (title === undefined) {
    db()
      .prepare(`UPDATE owui_chats SET chat = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(content), now, id);
    return;
  }
  db()
    .prepare(`UPDATE owui_chats SET chat = ?, title = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(content), title, now, id);
}

export function updateChatMeta(
  id: string,
  fields: { title?: string; archived?: boolean; pinned?: boolean; folderId?: string | null }
): void {
  const chat = getChat(id);
  if (!chat) return;

  db()
    .prepare(
      `UPDATE owui_chats SET title = ?, archived = ?, pinned = ?, folder_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      fields.title ?? chat.title,
      (fields.archived ?? chat.archived) ? 1 : 0,
      (fields.pinned ?? chat.pinned) ? 1 : 0,
      fields.folderId === undefined ? chat.folderId : fields.folderId,
      Date.now(),
      id
    );
}

export function deleteChat(id: string): void {
  db().prepare(`DELETE FROM owui_chats WHERE id = ?`).run(id);
}

/** Settings → Data Controls → Delete All Chats. Irreversible; the confirm dialog is the only guard. */
export function deleteAllChats(): number {
  const result = db().prepare(`DELETE FROM owui_chats`).run();
  return result.changes ?? 0;
}

export function setArchivedForAll(archived: boolean): number {
  const result = db()
    .prepare(`UPDATE owui_chats SET archived = ? WHERE archived = ?`)
    .run(archived ? 1 : 0, archived ? 0 : 1);
  return result.changes ?? 0;
}

export interface OwuiChatListItem {
  id: string;
  title: string;
  updated_at: number;
  created_at: number;
  pinned: boolean;
  folder_id: string | null;
  share_id: string | null;
}

interface OwuiChatListRow extends Omit<OwuiChatListItem, "pinned"> {
  pinned: number;
}

function toListItem(row: OwuiChatListRow): OwuiChatListItem {
  return { ...row, pinned: row.pinned === 1, share_id: row.share_id ?? null };
}

/**
 * `archived` is tri-state on purpose. The sidebar wants unarchived chats, the Archived Chats
 * modal wants archived ones, and export wants BOTH — a boolean cannot say "both", and a second
 * query path for export would drift from this one the first time the filter changes.
 */
export interface ListChatsOptions {
  limit?: number;
  offset?: number;
  archived?: boolean | "all";
  /** Case-insensitive substring match on the title. */
  search?: string;
}

/** The sidebar's list. Deliberately does NOT read the blob — it can be megabytes per chat. */
export function listChats(options: ListChatsOptions = {}): OwuiChatListItem[] {
  const { limit = 60, offset = 0, archived = false, search } = options;
  const { where, params } = buildFilter(archived, search);

  const rows = db()
    .prepare<OwuiChatListRow>(
      `SELECT id, title, updated_at, created_at, pinned, folder_id, share_id
       FROM owui_chats
       ${where}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return rows.map(toListItem);
}

export function countChats(options: Pick<ListChatsOptions, "archived" | "search"> = {}): number {
  const { archived = false, search } = options;
  const { where, params } = buildFilter(archived, search);

  const row = db()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM owui_chats ${where}`)
    .get(...params);
  return row?.n ?? 0;
}

/** Full rows including the blob — export only. Never call this to render a list. */
export function listChatsWithContent(options: Pick<ListChatsOptions, "archived"> = {}): OwuiChat[] {
  const { archived = false } = options;
  const { where, params } = buildFilter(archived);

  return db()
    .prepare<OwuiChatRow>(`SELECT * FROM owui_chats ${where} ORDER BY updated_at DESC`)
    .all(...params)
    .map(toChat);
}

function buildFilter(
  archived: boolean | "all",
  search?: string
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (archived !== "all") {
    clauses.push("archived = ?");
    params.push(archived ? 1 : 0);
  }

  const term = search?.trim();
  if (term) {
    // LIKE is case-insensitive for ASCII in SQLite by default; escape the wildcards so a title
    // search for "100%" does not match everything.
    clauses.push("title LIKE ? ESCAPE '\\'");
    params.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}
