import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const { runMigrations } = await import("../../src/lib/db/migrationRunner.ts");

function createTempLayout() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-pre-backup-"));
  const migrationsDir = path.join(rootDir, "migrations");
  const backupDir = path.join(rootDir, "backups");
  const dbFile = path.join(rootDir, "storage.sqlite");
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  return { rootDir, migrationsDir, backupDir, dbFile };
}

function writeMigration(migrationsDir, fileName, sql) {
  fs.writeFileSync(path.join(migrationsDir, fileName), sql, "utf8");
}

// Regression test for the pre-migration backup: it exists for exactly one
// scenario (a migration went wrong) and must actually be restorable — not
// just contain tables with data, but every index/trigger/view, plus FTS5
// virtual tables and their sync triggers, functioning after restore.
test("pre-migration backup preserves indexes, triggers, views, and a working FTS5 table", () => {
  const { rootDir, migrationsDir, backupDir, dbFile } = createTempLayout();
  const db = new Database(dbFile);

  try {
    // Mirrors the shape of migrations 006 (ring-buffer trigger) and 022
    // (FTS5 + sync triggers), plus a plain index and a view, so the backup
    // has real schema objects worth checking beyond "table exists".
    db.exec(`
      CREATE TABLE IF NOT EXISTS request_detail_logs (
        id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rdl_timestamp ON request_detail_logs(timestamp);
      CREATE TRIGGER IF NOT EXISTS trg_rdl_ring_buffer
      AFTER INSERT ON request_detail_logs
      BEGIN
        DELETE FROM request_detail_logs
        WHERE id IN (
          SELECT id FROM request_detail_logs
          ORDER BY timestamp ASC
          LIMIT MAX(0, (SELECT COUNT(*) FROM request_detail_logs) - 5)
        );
      END;

      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, content);
      CREATE TRIGGER IF NOT EXISTS trg_memories_fts_insert
      AFTER INSERT ON memories
      BEGIN
        INSERT INTO memories_fts (id, content) VALUES (NEW.id, NEW.content);
      END;

      CREATE VIEW IF NOT EXISTS recent_request_logs AS
        SELECT id, timestamp FROM request_detail_logs ORDER BY timestamp DESC;
    `);

    for (let i = 0; i < 8; i++) {
      db.prepare("INSERT INTO request_detail_logs (timestamp, payload) VALUES (?, ?)").run(
        new Date(2024, 0, i + 1).toISOString(),
        `log-${i}`
      );
    }
    db.prepare("INSERT INTO memories (id, content) VALUES (?, ?)").run("m1", "hello world");
    db.prepare("INSERT INTO memories_fts (id, content) VALUES (?, ?)").run("m1", "hello world");

    // Ring-buffer trigger already fired on each insert above, capping at 5.
    const preCount = db.prepare("SELECT COUNT(*) AS c FROM request_detail_logs").get();
    assert.equal(preCount.c, 5, "sanity: ring-buffer trigger enforces the cap before backup");

    writeMigration(
      migrationsDir,
      "001_risky_delete.sql",
      "DELETE FROM memories WHERE id = 'nonexistent';"
    );

    const appliedCount = runMigrations(db, { migrationsDir, backupDir, maxBackupFiles: 3 });
    assert.equal(appliedCount, 1);

    const backupFiles = fs.readdirSync(backupDir).filter((name) => name.includes("pre-migration"));
    assert.equal(backupFiles.length, 1, "exactly one pre-migration backup should exist");

    // Treat the backup file as the live DB — this is what "restore" means in
    // practice for a SQLite file-based backup.
    const restored = new Database(path.join(backupDir, backupFiles[0]));
    try {
      // Trigger: insert past the ring-buffer cap and confirm it still prunes.
      restored
        .prepare("INSERT INTO request_detail_logs (timestamp, payload) VALUES (?, ?)")
        .run(new Date(2024, 1, 1).toISOString(), "post-restore");
      const afterInsert = restored.prepare("SELECT COUNT(*) AS c FROM request_detail_logs").get();
      assert.equal(
        afterInsert.c,
        5,
        "ring-buffer trigger must still enforce the cap after restore"
      );

      // Index: still present in sqlite_master.
      const index = restored
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_rdl_timestamp'"
        )
        .get();
      assert.ok(index, "index must survive restore");

      // View: still queryable.
      const viewRows = restored.prepare("SELECT * FROM recent_request_logs").all();
      assert.ok(Array.isArray(viewRows) && viewRows.length === 5, "view must survive restore");

      // FTS5 virtual table: still queryable via MATCH, and its sync trigger
      // still fires for new rows.
      const ftsHit = restored
        .prepare("SELECT id FROM memories_fts WHERE memories_fts MATCH 'hello'")
        .get();
      assert.ok(ftsHit, "memories_fts must be searchable after restore");

      restored
        .prepare("INSERT INTO memories (id, content) VALUES (?, ?)")
        .run("m2", "second memory");
      const ftsAfterTrigger = restored
        .prepare("SELECT id FROM memories_fts WHERE memories_fts MATCH 'second'")
        .get();
      assert.ok(ftsAfterTrigger, "memories_fts sync trigger must still fire after restore");
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
