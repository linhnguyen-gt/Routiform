// Read an API key from the local DB when a 401 is encountered.
// Reuses the same DATA_DIR resolution logic as bin/reset-password.mjs.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveDataDir() {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR);
  const home = homedir();
  if (home) {
    if (platform() === "win32") {
      const appData = process.env.APPDATA || resolve(home, "AppData", "Roaming");
      return resolve(appData, "routiform");
    }
    return resolve(home, ".routiform");
  }
  // Fallback: relative to CLI location (standalone build layout)
  return resolve(__dirname, "..", "..", "data");
}

export function getDbPath() {
  return resolve(resolveDataDir(), "storage.sqlite");
}

// Returns a plaintext API key from the local DB, or null if none exists.
export async function readApiKeyFromDb() {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) return null;

  let Database;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    return null;
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare("SELECT key FROM api_keys WHERE is_active = 1 ORDER BY created_at LIMIT 1")
      .get();
    return row && typeof row.key === "string" && row.key.length > 0 ? row.key : null;
  } catch {
    return null;
  } finally {
    if (db)
      try {
        db.close();
      } catch {
        /* ignore */
      }
  }
}
