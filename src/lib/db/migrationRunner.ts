/**
 * Migration Runner — Versioned SQL Migrations for SQLite
 *
 * Reads numbered `.sql` files from the migrations directory and applies
 * them sequentially, tracking applied versions in a `schema_migrations` table.
 *
 * Naming convention: `NNN_description.sql` (e.g., `001_initial_schema.sql`)
 *
 * Each `NNN` prefix must be unique across the migrations folder — duplicate version numbers
 * (e.g. two `032_*.sql` files) produce undefined ordering and failed upgrades; always add the
 * next free integer instead of reusing a slot.
 *
 * All migrations run within a single transaction — all-or-nothing per file.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type Database from "better-sqlite3";
import { getDbBackupMaxFiles } from "@/lib/logEnv";

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

const RISKY_MIGRATION_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: "drop_table", regex: /\bDROP\s+TABLE\b/i },
  { key: "drop_column", regex: /\bDROP\s+COLUMN\b/i },
  { key: "delete_from", regex: /\bDELETE\s+FROM\b/i },
  { key: "rename_table", regex: /\bALTER\s+TABLE\b[\s\S]*\bRENAME\s+TO\b/i },
  { key: "truncate", regex: /\bTRUNCATE\b/i },
];

const EXPLICIT_TRANSACTION_PATTERN =
  /\b(BEGIN(?:\s+(?:TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE))?|COMMIT(?:\s+TRANSACTION)?|ROLLBACK(?:\s+TRANSACTION)?)\b/i;

type MigrationFile = { version: string; name: string; path: string };

type MigrationRunOptions = {
  migrationsDir?: string;
  backupDir?: string;
  maxBackupFiles?: number;
};

function sanitizeSqlForAnalysis(sql: string): string {
  const source = String(sql || "");
  let result = "";
  let i = 0;
  let inString = false;

  while (i < source.length) {
    const current = source[i];
    const next = source[i + 1];

    if (inString) {
      if (current === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (current === "'") {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (current === "'") {
      inString = true;
      i += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      i += 2;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    result += current;
    i += 1;
  }

  return result;
}

function stripTriggerStatements(sql: string): string {
  return sql.replace(/CREATE\s+TRIGGER[\s\S]*?\bEND\s*;/gi, "");
}

function getTopLevelSql(sql: string): string {
  return stripTriggerStatements(sanitizeSqlForAnalysis(sql));
}

function allowRiskyMigrationWithoutBackup(): boolean {
  const value = String(process.env.ALLOW_UNSAFE_MIGRATION_WITHOUT_BACKUP || "").trim();
  return /^(1|true|yes)$/i.test(value);
}

/** @internal Exported for unit tests */
export function getMigrationRiskFlags(sql: string): string[] {
  const source = getTopLevelSql(sql);
  return RISKY_MIGRATION_PATTERNS.filter((pattern) => pattern.regex.test(source)).map(
    (pattern) => pattern.key
  );
}

function hasExplicitTransaction(sql: string): boolean {
  return EXPLICIT_TRANSACTION_PATTERN.test(getTopLevelSql(sql));
}

function resolveMainDbFile(db: Database.Database): string | null {
  try {
    const rows = db.prepare("PRAGMA database_list").all() as Array<{
      name?: string;
      file?: string;
    }>;
    const main = rows.find((row) => row.name === "main");
    const file = typeof main?.file === "string" ? main.file.trim() : "";
    if (!file || file === ":memory:") return null;
    return file;
  } catch {
    return null;
  }
}

function rotatePreMigrationBackups(backupDir: string, maxFiles: number): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((filename) => filename.startsWith("db_") && filename.endsWith(".sqlite"))
    .sort();

  while (files.length > maxFiles) {
    const oldest = files.shift();
    if (!oldest) break;
    try {
      fs.unlinkSync(path.join(backupDir, oldest));
    } catch {
      // Best effort rotation only.
    }
  }
}

function createPreMigrationBackupSnapshot(
  db: Database.Database,
  options?: Pick<MigrationRunOptions, "backupDir" | "maxBackupFiles">
): string | null {
  const sqliteFile = resolveMainDbFile(db);
  if (!sqliteFile || !fs.existsSync(sqliteFile)) return null;

  const backupDir = options?.backupDir || path.join(path.dirname(sqliteFile), "db_backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupMaxFiles = Math.max(1, options?.maxBackupFiles ?? getDbBackupMaxFiles());
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `db_${timestamp}_pre-migration.sqlite`);

  // Full raw file copy (not a schema-only "lite" copy): a pre-migration
  // backup exists for exactly one scenario — recovering from a migration
  // that went wrong — and restorability is the entire point. A previous
  // attempt at a "lite" backup (ATTACH + per-table copy, excluding
  // `request_detail_logs` to save disk) only recreated `sqlite_master` rows
  // of type "table", silently dropping every index/trigger/view. Worse, it
  // also copied the migrations-tracking table, so the migration runner would
  // treat a restored backup as fully migrated and never re-run the missing
  // `CREATE TRIGGER` / `CREATE INDEX` statements (e.g. the
  // `trg_rdl_ring_buffer` ring-buffer trigger, `memories_fts` and its sync
  // triggers). That is a backup you cannot actually restore from. Disk size
  // is a nice-to-have; a byte-for-byte correct copy is not optional here.
  db.pragma("wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(sqliteFile, backupFile);
  rotatePreMigrationBackups(backupDir, backupMaxFiles);
  return backupFile;
}

/**
 * Ensure the versioned migrations tracking table exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
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
function getMigrationFiles(migrationsDir = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) return [];

  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        version: match[1],
        name: match[2],
        path: path.join(migrationsDir, filename),
      };
    })
    .filter(Boolean) as MigrationFile[];
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
export function runMigrations(db: Database.Database, options?: MigrationRunOptions): number {
  ensureMigrationsTable(db);

  const files = getMigrationFiles(options?.migrationsDir);
  const applied = getAppliedVersions(db);
  const pending = files.filter((migration) => !applied.has(migration.version));
  let count = 0;

  if (pending.length > 0) {
    const riskyPending = pending
      .map((migration) => {
        const sql = fs.readFileSync(migration.path, "utf-8");
        const risks = getMigrationRiskFlags(sql);
        const hasTransactions = hasExplicitTransaction(sql);
        return {
          migration,
          sql,
          risks,
          hasTransactions,
        };
      })
      .filter((entry) => entry.risks.length > 0 || entry.hasTransactions);

    const transactionConflict = riskyPending.find((entry) => entry.hasTransactions);
    if (transactionConflict) {
      throw new Error(
        `[Migration] Aborted: ${transactionConflict.migration.version}_${transactionConflict.migration.name} contains explicit transaction statements. Remove BEGIN/COMMIT/ROLLBACK because migrations already run inside a managed transaction.`
      );
    }

    if (riskyPending.length > 0) {
      try {
        const backupPath = createPreMigrationBackupSnapshot(db, {
          backupDir: options?.backupDir,
          maxBackupFiles: options?.maxBackupFiles,
        });
        if (!backupPath) {
          throw new Error("Unable to resolve an on-disk SQLite database file for backup");
        }
        console.log(
          `[Migration] Pre-migration backup created: ${path.basename(backupPath)} before risky migration(s): ${riskyPending.map((entry) => entry.migration.version).join(", ")}`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const riskyList = riskyPending
          .map(
            (entry) =>
              `${entry.migration.version}_${entry.migration.name}[${entry.risks.join("+") || "risky"}]`
          )
          .join(", ");
        if (allowRiskyMigrationWithoutBackup()) {
          console.warn(
            `[Migration] WARNING: pre-migration backup failed for risky migration(s): ${riskyList}. Continuing because ALLOW_UNSAFE_MIGRATION_WITHOUT_BACKUP is enabled. ${message}`
          );
        } else {
          throw new Error(
            `[Migration] Aborted: failed to create pre-migration backup for risky migration(s): ${riskyList}. ${message} (set ALLOW_UNSAFE_MIGRATION_WITHOUT_BACKUP=true to override)`
          );
        }
      }
    }
  }

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
