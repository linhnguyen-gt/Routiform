/**
 * Open WebUI's client preferences, persisted.
 *
 * An earlier version of this kept them in a module-level variable and shrugged that "a toggle
 * resets on restart". That was wrong about what is in here. The blob also holds **the selected
 * model** and the dismissed-changelog version — so not persisting it meant the model selector
 * reset to "Select a model" on every reload (blocking send until the user re-picked one) and the
 * "What's New" modal reappeared forever. Cosmetic it was not.
 *
 * One row, no user id: Routiform is single-operator and has no users table. Inventing a fake
 * user id to key this by would be a lie about the security model.
 *
 * @module lib/db/owui-settings
 */

import { getDbInstance } from "./core";

interface StatementLike<TRow = unknown> {
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
}

interface DbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
  exec: (sql: string) => void;
}

// Schema lives here, not only in a migration: getDbInstance() builds an in-memory DB during
// `next build` WITHOUT running migrations, so a migration-only table would not exist at build
// time and any route touching it would fail the production build.
const SETTINGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS owui_settings (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    settings   TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

// The INSTANCE the schema was applied to, not a bare boolean: `resetDbInstance()` (DB restore)
// swaps the singleton, and a boolean would leave db() handing back a fresh instance without this
// table. Reference equality re-runs the schema exactly when the instance changes.
let schemaAppliedTo: DbLike | null = null;

function db(): DbLike {
  const instance = getDbInstance() as unknown as DbLike;
  if (schemaAppliedTo === instance) return instance;
  instance.exec(SETTINGS_SCHEMA);
  schemaAppliedTo = instance;
  return instance;
}

/** Force the next db() to re-exec the schema. Tests only — a fresh in-memory DB needs a fresh exec. */
export function resetOwuiSettingsSchemaCache(): void {
  schemaAppliedTo = null;
}

export function getOwuiSettings(): Record<string, unknown> {
  const row = db()
    .prepare<{ settings: string }>(`SELECT settings FROM owui_settings WHERE id = 1`)
    .get();
  if (!row) return {};

  try {
    return JSON.parse(row.settings) as Record<string, unknown>;
  } catch {
    // A corrupted blob must not brick the chat: the SPA treats {} as "defaults".
    return {};
  }
}

export function saveOwuiSettings(settings: Record<string, unknown>): void {
  db()
    .prepare(
      `INSERT INTO owui_settings (id, settings, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(settings), Date.now());
}
