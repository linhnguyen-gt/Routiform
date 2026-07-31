import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * The DURABLE dedup store, against a real SQLite database running the real migration.
 *
 * Every other dedup test uses the in-memory store, so until this file existed the production path
 * had never executed. That is the path that persists across restarts and the one whose SQL can be
 * wrong — and the store deliberately swallows its own errors, degrading to "dedup never works"
 * with no signal. Untested plus silently-failing is the combination that ships a dead feature and
 * reports nothing, so the SQL is exercised here rather than assumed.
 */

const { SqliteDedupStore } =
  await import("../../open-sse/compression/engines/sqlite-dedup-store.ts");
const { DEDUP_MAX_ROWS_PER_CONVERSATION } =
  await import("../../open-sse/compression/engines/dedup-store.ts");

const MIGRATION = fs.readFileSync(
  path.join(process.cwd(), "src/lib/db/migrations/027_compression_dedup_blocks.sql"),
  "utf8"
);

function freshDb() {
  const db = new Database(":memory:");
  // The real migration file, not a hand-written CREATE TABLE. A test schema that drifts from the
  // shipped one tests a table that does not exist in production.
  db.exec(MIGRATION);
  return db;
}

function storeOn(db) {
  return new SqliteDedupStore(() => db);
}

const key = (overrides = {}) => ({
  apiKeyId: "key-A",
  conversationId: "conv-1",
  hash: "h1",
  ...overrides,
});

const block = (overrides = {}) => ({ ...key(overrides), content: "FILE CONTENTS", bytes: 13 });

test("the migration creates the table and both indexes", () => {
  const db = freshDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .all("compression_dedup_blocks");
  assert.equal(tables.length, 1);

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?")
    .all("compression_dedup_blocks")
    .map((row) => row.name);
  assert.ok(indexes.includes("idx_compression_dedup_last_seen"));
  assert.ok(indexes.includes("idx_compression_dedup_conversation"));
  db.close();
});

test("the primary key is the tenant, the conversation and the hash together", () => {
  // The cross-tenant guarantee lives in the schema, not in a filter someone can forget to apply.
  const db = freshDb();
  const pk = db
    .prepare(
      "SELECT name FROM pragma_table_info('compression_dedup_blocks') WHERE pk > 0 ORDER BY pk"
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(pk, ["api_key_id", "conversation_id", "hash"]);
  db.close();
});

test("put then get round-trips the block", () => {
  const db = freshDb();
  const store = storeOn(db);

  assert.equal(store.get(key()), null, "nothing stored yet");
  store.put([block()]);

  const found = store.get(key());
  assert.ok(found);
  assert.equal(found.content, "FILE CONTENTS");
  assert.equal(found.bytes, 13);
  assert.equal(store.size(), 1);
  db.close();
});

test("a different tenant does not see the block", () => {
  const db = freshDb();
  const store = storeOn(db);
  store.put([block({ apiKeyId: "key-A" })]);

  assert.equal(store.get(key({ apiKeyId: "key-B" })), null);
  assert.ok(store.get(key({ apiKeyId: "key-A" })));
  db.close();
});

test("a different conversation does not see the block", () => {
  const db = freshDb();
  const store = storeOn(db);
  store.put([block({ conversationId: "conv-1" })]);

  assert.equal(store.get(key({ conversationId: "conv-2" })), null);
  db.close();
});

test("re-putting the same block updates recency instead of failing on the primary key", () => {
  // ON CONFLICT ... DO UPDATE. Without it the second turn of a conversation throws a constraint
  // error, which the store would swallow — dedup would appear to work and quietly stop recording.
  const db = freshDb();
  const store = storeOn(db);

  store.put([block()]);
  const first = db
    .prepare("SELECT last_seen_at FROM compression_dedup_blocks WHERE hash = ?")
    .get("h1").last_seen_at;

  store.put([block()]);
  const second = db
    .prepare("SELECT last_seen_at FROM compression_dedup_blocks WHERE hash = ?")
    .get("h1").last_seen_at;

  assert.equal(store.size(), 1, "still one row, not a duplicate");
  assert.ok(second >= first);
  db.close();
});

test("touch refreshes recency for exactly one key", () => {
  const db = freshDb();
  const store = storeOn(db);
  store.put([block({ hash: "h1" }), block({ hash: "h2" })]);

  db.prepare("UPDATE compression_dedup_blocks SET last_seen_at = 0").run();
  store.touch(key({ hash: "h1" }));

  const rows = db
    .prepare("SELECT hash, last_seen_at FROM compression_dedup_blocks ORDER BY hash")
    .all();
  assert.ok(rows[0].last_seen_at > 0, "h1 was touched");
  assert.equal(rows[1].last_seen_at, 0, "h2 was not");
  db.close();
});

test("sweep removes only entries past the TTL and reports the count", () => {
  const db = freshDb();
  const store = storeOn(db);
  store.put([block({ hash: "old" }), block({ hash: "new" })]);

  db.prepare("UPDATE compression_dedup_blocks SET last_seen_at = ? WHERE hash = ?").run(
    Date.now() - 10_000,
    "old"
  );

  const removed = store.sweep(5_000);
  assert.equal(removed, 1);
  assert.equal(store.size(), 1);
  assert.ok(store.get(key({ hash: "new" })));
  assert.equal(store.get(key({ hash: "old" })), null);
  db.close();
});

test("the per-conversation cap evicts the least recently seen rows", () => {
  const db = freshDb();
  const store = storeOn(db);

  const many = Array.from({ length: DEDUP_MAX_ROWS_PER_CONVERSATION + 25 }, (_, i) =>
    block({ hash: `h${i}` })
  );
  store.put(many);

  assert.equal(
    store.size(),
    DEDUP_MAX_ROWS_PER_CONVERSATION,
    "one long conversation must not grow the table without bound"
  );
  db.close();
});

test("the cap is per conversation, not global", () => {
  const db = freshDb();
  const store = storeOn(db);

  store.put(
    Array.from({ length: 10 }, (_, i) => block({ conversationId: "conv-1", hash: `a${i}` }))
  );
  store.put(
    Array.from({ length: 10 }, (_, i) => block({ conversationId: "conv-2", hash: `b${i}` }))
  );

  assert.equal(store.size(), 20);
  db.close();
});

// ── degradation, which is the behaviour that had never been checked ──────────

test("with no database, every operation degrades to no-dedup rather than throwing", () => {
  // Compression is an optimisation. A store that takes the request down with it when the DB is
  // unavailable trades a delivered answer for a cache entry.
  const store = new SqliteDedupStore(() => null);

  assert.equal(store.get(key()), null);
  assert.doesNotThrow(() => store.put([block()]));
  assert.doesNotThrow(() => store.touch(key()));
  assert.equal(store.sweep(1000), 0);
  assert.equal(store.size(), 0);
});

test("a getDb that throws is treated as no database", () => {
  const store = new SqliteDedupStore(() => {
    throw new Error("database is locked");
  });
  assert.equal(store.get(key()), null);
  assert.doesNotThrow(() => store.put([block()]));
});

test("a missing table degrades instead of throwing", () => {
  // What a half-applied migration looks like at runtime.
  const db = new Database(":memory:");
  const store = storeOn(db);

  assert.equal(store.get(key()), null);
  assert.doesNotThrow(() => store.put([block()]));
  assert.equal(store.size(), 0);
  db.close();
});

test("putting nothing is a no-op, not an empty statement", () => {
  const db = freshDb();
  const store = storeOn(db);
  assert.doesNotThrow(() => store.put([]));
  assert.equal(store.size(), 0);
  db.close();
});

test("content with quotes and newlines survives the round trip", () => {
  // Parameter binding rather than interpolation. Tool output is full of both.
  const db = freshDb();
  const store = storeOn(db);
  const nasty = `line1'; DROP TABLE compression_dedup_blocks; --\n"quoted"\n\ttabbed`;

  store.put([{ ...key(), content: nasty, bytes: nasty.length }]);
  assert.equal(store.get(key()).content, nasty);
  assert.equal(store.size(), 1, "the table is still there");
  db.close();
});
