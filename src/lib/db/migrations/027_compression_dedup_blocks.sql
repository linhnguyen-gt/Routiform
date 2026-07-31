-- Migration 027: content-addressed block store for Session-Dedup compression.
--
-- The primary key carries api_key_id UNCONDITIONALLY. Without it, one caller's stored block
-- suppresses another caller's identical block, and the second caller's model receives a
-- back-reference to content it was never sent. That is not a cache miss, it is a cross-tenant
-- leak, which is why the tenant dimension is part of the key rather than a filter applied later.
--
-- conversation_id is equally load-bearing: dedup markers only make sense as a back-reference to
-- something the model already saw in THIS conversation.

CREATE TABLE IF NOT EXISTS compression_dedup_blocks (
  api_key_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  content TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (api_key_id, conversation_id, hash)
);

-- Drives the TTL sweep without scanning the table.
CREATE INDEX IF NOT EXISTS idx_compression_dedup_last_seen
  ON compression_dedup_blocks(last_seen_at);

-- Drives the per-conversation row cap, so the store cannot grow without bound on a long session.
CREATE INDEX IF NOT EXISTS idx_compression_dedup_conversation
  ON compression_dedup_blocks(api_key_id, conversation_id, last_seen_at);
