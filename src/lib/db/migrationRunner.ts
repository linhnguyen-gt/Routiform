/**
 * Migration Runner — Versioned SQL Migrations for SQLite
 *
 * Reads numbered `.sql` files from the migrations directory and applies
 * them sequentially, tracking applied versions in a `schema_migrations` table.
 *
 * Naming convention: `NNN_description.sql` (e.g., `001_initial_schema.sql`)
 *
 * All migrations run within a single transaction — all-or-nothing per file.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type Database from "better-sqlite3";

/**
 * Resolve the migrations directory path safely across platforms.
 * On Windows with global npm installs, `import.meta.url` may not be a valid
 * `file://` URL, causing `fileURLToPath` to throw `ERR_INVALID_FILE_URL_PATH`.
 */
function resolveMigrationsDir(): string {
  try {
    const metaUrl = import.meta.url;
    if (metaUrl && metaUrl.startsWith("file://")) {
      const __filename = fileURLToPath(metaUrl);
      return path.join(path.dirname(__filename), "migrations");
    }
  } catch {
    // fileURLToPath failed (e.g. Windows global install) — use fallback
  }
  // Fallback: resolve relative to cwd (works for both dev and global installs)
  return path.join(process.cwd(), "src", "lib", "db", "migrations");
}

const MIGRATIONS_DIR = resolveMigrationsDir();

const MIGRATIONS_TABLE = "_routiform_migrations";
const LEGACY_MIGRATIONS_TABLE = "_omniroute_migrations";

/** One-time rename after Routiform rebrand — existing installs keep applied versions. */
function maybeRenameLegacyMigrationsTable(db: Database.Database): void {
  try {
    const hasLegacy = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(LEGACY_MIGRATIONS_TABLE) as { name?: string } | undefined;
    const hasCurrent = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(MIGRATIONS_TABLE) as { name?: string } | undefined;
    if (hasLegacy && !hasCurrent) {
      db.exec(`ALTER TABLE ${LEGACY_MIGRATIONS_TABLE} RENAME TO ${MIGRATIONS_TABLE}`);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ensure the versioned migrations tracking table exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
  maybeRenameLegacyMigrationsTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get all migration files sorted by version number.
 */
function getMigrationFiles(): Array<{ version: string; name: string; path: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        version: match[1],
        name: match[2],
        path: path.join(MIGRATIONS_DIR, filename),
      };
    })
    .filter(Boolean) as Array<{ version: string; name: string; path: string }>;
}

/**
 * Get list of already-applied migration versions.
 */
function getAppliedVersions(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`).all() as Array<{
    version: string;
  }>;
  return new Set(rows.map((r) => r.version));
}

/**
 * Run all pending migrations in order.
 * Returns the number of migrations applied.
 */
export function runMigrations(db: Database.Database): number {
  ensureMigrationsTable(db);

  const files = getMigrationFiles();
  const applied = getAppliedVersions(db);
  let count = 0;

  for (const migration of files) {
    if (applied.has(migration.version)) continue;

    const sql = fs.readFileSync(migration.path, "utf-8");

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES (?, ?)`).run(
        migration.version,
        migration.name
      );
    });

    try {
      applyMigration();
      count++;
      console.log(`[Migration] Applied: ${migration.version}_${migration.name}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Migration] FAILED: ${migration.version}_${migration.name} — ${message}`);
      throw err; // Re-throw to prevent DB from starting in inconsistent state
    }
  }

  if (count > 0) {
    console.log(`[Migration] ${count} migration(s) applied successfully.`);
  }

  return count;
}

/**
 * Get migration status for diagnostics.
 */
export function getMigrationStatus(db: Database.Database): {
  applied: Array<{ version: string; name: string; applied_at: string }>;
  pending: Array<{ version: string; name: string }>;
} {
  ensureMigrationsTable(db);

  const appliedRows = db
    .prepare(`SELECT version, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version`)
    .all() as Array<{ version: string; name: string; applied_at: string }>;

  const appliedVersions = new Set(appliedRows.map((r) => r.version));
  const allFiles = getMigrationFiles();
  const pending = allFiles.filter((f) => !appliedVersions.has(f.version));

  return { applied: appliedRows, pending };
}
