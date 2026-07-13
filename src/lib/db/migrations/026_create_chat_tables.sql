-- Migration 026: native chat (conversations, messages, attachments)
--
-- NOTE: no ON DELETE CASCADE anywhere below. This database never enables
-- `PRAGMA foreign_keys`, so a CASCADE clause would be decoration and children
-- would be silently orphaned on delete. src/lib/db/chat.ts deletes children
-- explicitly inside a transaction instead.
--
-- This DDL is duplicated in src/lib/db/chat.ts (CHAT_SCHEMA) on purpose: the
-- build/cloud branch of getDbInstance() builds an in-memory DB and never runs
-- migrations, so a migration-only table does not exist during `next build`.
-- Keep the two copies identical.

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
  -- AI SDK message parts (text / file / tool-*), as JSON. Not a flat string:
  -- attachments and tool calls must survive a reload.
  parts           TEXT NOT NULL,
  -- 'streaming' rows are in flight. Without this a crashed turn is
  -- indistinguishable from a complete one and the user silently loses a prompt.
  status          TEXT NOT NULL DEFAULT 'complete',
  model           TEXT,
  -- X-Routiform-Request-Id from the router, for the call_logs cost join.
  request_id      TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      INTEGER NOT NULL
);

-- Content-addressed. Attachments are referenced from chat_messages.parts by
-- sha256 and rehydrated server-side; they are NEVER inlined as base64 in the
-- message, because useChat re-POSTs the whole message array every turn and the
-- 10 MB body cap in src/shared/middleware/bodySizeGuard.ts would 413 the
-- conversation into an unusable state.
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
