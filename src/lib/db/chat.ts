/**
 * Native chat persistence — conversations, messages, attachments.
 *
 * Schema lives in two places on purpose. Migration 026 covers the on-disk path;
 * CHAT_SCHEMA below covers the build/cloud path, where getDbInstance() builds an
 * in-memory DB and returns WITHOUT calling runMigrations() (see core.ts). A
 * migration-only table therefore does not exist during `next build`, and any
 * route touching it fails the production build. Keep the two copies identical.
 *
 * @module lib/db/chat
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
  transaction: (fn: () => void) => () => void;
}

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageStatus = "streaming" | "complete" | "error" | "interrupted";

export interface ChatConversation {
  id: string;
  title: string;
  model: string;
  provider: string | null;
  systemPrompt: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  parts: unknown[];
  status: ChatMessageStatus;
  model: string | null;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}

export interface ChatAttachment {
  sha256: string;
  mime: string;
  bytes: number;
  data: Buffer;
  createdAt: number;
}

// ── Schema (mirror of migration 026) ─────────────────────────────────────────

const CHAT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL,
    provider      TEXT,
    system_prompt TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    parts           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'complete',
    model           TEXT,
    request_id      TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_attachments (
    sha256     TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    data       BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_status
    ON chat_messages(status);
  CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
    ON chat_conversations(updated_at DESC);
`;

let schemaReady = false;

/**
 * Create the chat tables if they are missing.
 *
 * Unlike prompts.ts's ensureSchema(), this does NOT swallow the error. Swallowing
 * it leaves schemaReady=false and the table absent, and every subsequent
 * prepare() then throws a raw SQLITE_ERROR out of a route handler. Fail here,
 * where the cause is still legible.
 */
function ensureChatSchema(): DbLike {
  const db = getDbInstance() as unknown as DbLike;
  if (schemaReady) return db;
  db.exec(CHAT_SCHEMA);
  schemaReady = true;
  return db;
}

/** Reset the memoized flag. Tests only — a fresh in-memory DB needs a fresh exec. */
export function resetChatSchemaCache(): void {
  schemaReady = false;
}

// ── Row mapping ──────────────────────────────────────────────────────────────

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

function nullableNum(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function parseParts(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A row with unparseable parts is corrupt, not fatal — render it as empty
    // rather than taking down the whole conversation.
    return [];
  }
}

function toRole(value: unknown): ChatRole {
  return value === "assistant" || value === "system" ? value : "user";
}

function toStatus(value: unknown): ChatMessageStatus {
  return value === "streaming" || value === "error" || value === "interrupted" ? value : "complete";
}

function mapConversation(row: Record<string, unknown>): ChatConversation {
  return {
    id: str(row.id),
    title: str(row.title),
    model: str(row.model),
    provider: nullableStr(row.provider),
    systemPrompt: nullableStr(row.system_prompt),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: str(row.id),
    conversationId: str(row.conversation_id),
    role: toRole(row.role),
    parts: parseParts(row.parts),
    status: toStatus(row.status),
    model: nullableStr(row.model),
    requestId: nullableStr(row.request_id),
    inputTokens: nullableNum(row.input_tokens),
    outputTokens: nullableNum(row.output_tokens),
    createdAt: num(row.created_at),
  };
}

// ── Conversations ────────────────────────────────────────────────────────────

export function createConversation(input: {
  model: string;
  provider?: string | null;
  systemPrompt?: string | null;
  title?: string;
}): ChatConversation {
  const db = ensureChatSchema();
  const now = Date.now();
  const conversation: ChatConversation = {
    id: crypto.randomUUID(),
    title: input.title ?? "",
    model: input.model,
    provider: input.provider ?? null,
    systemPrompt: input.systemPrompt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO chat_conversations (id, title, model, provider, system_prompt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    conversation.id,
    conversation.title,
    conversation.model,
    conversation.provider,
    conversation.systemPrompt,
    conversation.createdAt,
    conversation.updatedAt
  );

  return conversation;
}

export function listConversations(): ChatConversation[] {
  const db = ensureChatSchema();
  const rows = db
    .prepare<Record<string, unknown>>(`SELECT * FROM chat_conversations ORDER BY updated_at DESC`)
    .all();
  return rows.map(mapConversation);
}

export function getConversation(id: string): ChatConversation | null {
  const db = ensureChatSchema();
  const row = db
    .prepare<Record<string, unknown>>(`SELECT * FROM chat_conversations WHERE id = ?`)
    .get(id);
  return row ? mapConversation(row) : null;
}

export function updateConversation(
  id: string,
  patch: { title?: string; model?: string; provider?: string | null; systemPrompt?: string | null }
): ChatConversation | null {
  const db = ensureChatSchema();
  const existing = getConversation(id);
  if (!existing) return null;

  const next: ChatConversation = {
    ...existing,
    title: patch.title ?? existing.title,
    model: patch.model ?? existing.model,
    provider: patch.provider !== undefined ? patch.provider : existing.provider,
    systemPrompt: patch.systemPrompt !== undefined ? patch.systemPrompt : existing.systemPrompt,
    updatedAt: Date.now(),
  };

  db.prepare(
    `UPDATE chat_conversations
     SET title = ?, model = ?, provider = ?, system_prompt = ?, updated_at = ?
     WHERE id = ?`
  ).run(next.title, next.model, next.provider, next.systemPrompt, next.updatedAt, id);

  return next;
}

/**
 * Delete a conversation and its messages.
 *
 * Children are removed explicitly. This database never enables
 * `PRAGMA foreign_keys`, so an ON DELETE CASCADE would be a no-op and every
 * message row — including attachment references — would be orphaned forever,
 * still present in the file and in every backup export.
 */
export function deleteConversation(id: string): boolean {
  const db = ensureChatSchema();
  let deleted = false;

  db.transaction(() => {
    db.prepare(`DELETE FROM chat_messages WHERE conversation_id = ?`).run(id);
    const result = db.prepare(`DELETE FROM chat_conversations WHERE id = ?`).run(id);
    deleted = (result.changes ?? 0) > 0;
  })();

  return deleted;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function listMessages(conversationId: string): ChatMessage[] {
  const db = ensureChatSchema();
  const rows = db
    .prepare<
      Record<string, unknown>
    >(`SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .all(conversationId);
  return rows.map(mapMessage);
}

export function appendMessage(input: {
  conversationId: string;
  role: ChatRole;
  parts: unknown[];
  status?: ChatMessageStatus;
  model?: string | null;
  requestId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): ChatMessage {
  const db = ensureChatSchema();
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    parts: input.parts,
    status: input.status ?? "complete",
    model: input.model ?? null,
    requestId: input.requestId ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    createdAt: Date.now(),
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO chat_messages
         (id, conversation_id, role, parts, status, model, request_id, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      message.id,
      message.conversationId,
      message.role,
      JSON.stringify(message.parts),
      message.status,
      message.model,
      message.requestId,
      message.inputTokens,
      message.outputTokens,
      message.createdAt
    );
    db.prepare(`UPDATE chat_conversations SET updated_at = ? WHERE id = ?`).run(
      message.createdAt,
      message.conversationId
    );
  })();

  return message;
}

/**
 * Drop every message past the first `keepCount`, oldest first.
 *
 * The client re-POSTs its entire message array on every turn, so that array — not the table —
 * is the authoritative shape of the transcript. When the user edits an earlier turn or hits
 * regenerate, the client TRUNCATES its array; the rows it dropped must go too.
 *
 * Without this, a regenerate appends a second copy of the same question and leaves the old
 * answer sitting underneath it, and an edit leaves the original question and its answer behind.
 * Neither is visible until the next reload, at which point the transcript is quietly corrupt.
 *
 * `created_at` is a millisecond stamp and two messages in one turn can tie on it, so rowid
 * breaks the tie — otherwise which row survives a truncation would be down to chance.
 */
export function truncateMessagesTo(conversationId: string, keepCount: number): number {
  const db = ensureChatSchema();
  const info = db
    .prepare(
      `DELETE FROM chat_messages
        WHERE conversation_id = ?
          AND id NOT IN (
            SELECT id FROM chat_messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC, rowid ASC
             LIMIT ?
          )`
    )
    .run(conversationId, conversationId, Math.max(0, keepCount));
  return info.changes;
}

/**
 * Finalize a turn that was inserted as 'streaming'.
 *
 * Called from onFinish (complete) and from onError/onAbort (error). A turn that
 * never reaches either — a hard crash — is caught by sweepInterruptedMessages().
 */
export function updateMessage(
  id: string,
  patch: {
    parts?: unknown[];
    status?: ChatMessageStatus;
    requestId?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }
): void {
  const db = ensureChatSchema();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.parts !== undefined) {
    sets.push("parts = ?");
    values.push(JSON.stringify(patch.parts));
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.requestId !== undefined) {
    sets.push("request_id = ?");
    values.push(patch.requestId);
  }
  if (patch.inputTokens !== undefined) {
    sets.push("input_tokens = ?");
    values.push(patch.inputTokens);
  }
  if (patch.outputTokens !== undefined) {
    sets.push("output_tokens = ?");
    values.push(patch.outputTokens);
  }
  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE chat_messages SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/**
 * Mark stale in-flight turns as interrupted.
 *
 * The only recovery from a hard crash: onFinish/onError never fired, so the row
 * is stuck at 'streaming'. Without this sweep the UI would render a permanently
 * pending turn. Call once at startup.
 */
export function sweepInterruptedMessages(olderThanMs = 5 * 60 * 1000): number {
  const db = ensureChatSchema();
  const cutoff = Date.now() - olderThanMs;
  const result = db
    .prepare(
      `UPDATE chat_messages SET status = 'interrupted'
       WHERE status = 'streaming' AND created_at < ?`
    )
    .run(cutoff);
  return result.changes ?? 0;
}

// ── Attachments (content-addressed; filled by Phase 03) ───────────────────────

export function putAttachment(data: Buffer, mime: string): ChatAttachment {
  const db = ensureChatSchema();
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const attachment: ChatAttachment = {
    sha256,
    mime,
    bytes: data.byteLength,
    data,
    createdAt: Date.now(),
  };

  // Content-addressed: the same bytes uploaded twice store one row.
  db.prepare(
    `INSERT OR IGNORE INTO chat_attachments (sha256, mime, bytes, data, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sha256, mime, attachment.bytes, data, attachment.createdAt);

  return attachment;
}

export function getAttachment(sha256: string): ChatAttachment | null {
  const db = ensureChatSchema();
  const row = db
    .prepare<Record<string, unknown>>(`SELECT * FROM chat_attachments WHERE sha256 = ?`)
    .get(sha256);
  if (!row) return null;

  return {
    sha256: str(row.sha256),
    mime: str(row.mime),
    bytes: num(row.bytes),
    data: Buffer.isBuffer(row.data) ? row.data : Buffer.from([]),
    createdAt: num(row.created_at),
  };
}
