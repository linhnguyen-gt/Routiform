import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { getDbInstance, SQLITE_FILE, DATA_DIR } from "@/lib/db/core";
import fs from "fs";
import path from "path";
import os from "os";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";

const RESTORE_README = `Routiform portable backup
========================

Files in this archive:
- storage.sqlite   Full SQLite database (provider keys may be encrypted at rest)
- server.env       Included when present on the source machine: STORAGE_ENCRYPTION_KEY, JWT_SECRET, API_KEY_SECRET, etc.
- RESTORE_README.txt This file
- *.json           Redundant summaries (settings, combos, providers without secrets) for inspection

Moving to another computer (recommended):
1) Install Routiform and note DATA_DIR (Settings shows the database path).
2) Stop the app.
3) Extract storage.sqlite and server.env (if included) into DATA_DIR.
4) Start the app.

Import via Settings (database file only):
- Place server.env in DATA_DIR first (same encryption key as the source), then use Import Database with storage.sqlite from this archive.
- If server.env is missing or the key differs, encrypted credentials in the DB cannot be decrypted; re-enter API keys under Providers.

Treat this archive like secrets: store it securely and do not share publicly.
`;

/**
 * GET /api/db-backups/exportAll
 * Exports database + JSON summaries + server.env (when present) as tar.gz.
 *
 * 🔒 Auth-guarded: requires JWT cookie or Bearer API key (same as /export).
 */
export async function GET(request: Request) {
  if (await isAuthRequired()) {
    if (!(await isAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    if (!SQLITE_FILE) {
      return NextResponse.json(
        { error: "Export is only available in local (non-cloud) mode" },
        { status: 400 }
      );
    }

    const db = getDbInstance();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const tempDir = path.join(os.tmpdir(), `routiform-export-${timestamp}`);
    const tarBasename = `routiform-full-backup-${timestamp}.tar.gz`;
    const tarPath = path.join(os.tmpdir(), tarBasename);

    try {
      // Create temp directory
      fs.mkdirSync(tempDir, { recursive: true });

      // 1. Export database using native backup API
      const dbBackupPath = path.join(tempDir, "storage.sqlite");
      await db.backup(dbBackupPath);

      // 2. Export settings as JSON
      const settings: Record<string, string> = {};
      try {
        const rows = db.prepare("SELECT key, value FROM key_value").all() as {
          key: string;
          value: string;
        }[];
        for (const row of rows) {
          settings[row.key] = row.value;
        }
      } catch {
        // key_value table might not exist
      }
      fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify(settings, null, 2));

      // 3. Export combos summary
      const combos: unknown[] = [];
      try {
        const rows = db.prepare("SELECT * FROM combos").all();
        combos.push(...rows);
      } catch {
        // combos table might not exist
      }
      fs.writeFileSync(path.join(tempDir, "combos.json"), JSON.stringify(combos, null, 2));

      // 4. Export provider connections (without sensitive credentials)
      const providers: unknown[] = [];
      try {
        const rows = db
          .prepare(
            "SELECT id, provider, name, auth_type, is_active, email, created_at FROM provider_connections"
          )
          .all();
        providers.push(...rows);
      } catch {
        // provider_connections table might not exist
      }
      fs.writeFileSync(path.join(tempDir, "providers.json"), JSON.stringify(providers, null, 2));

      // 5. Export API keys summary (masked)
      const apiKeys: unknown[] = [];
      try {
        const rows = db
          .prepare(
            "SELECT id, name, substr(key, 1, 8) as prefix, machine_id, created_at FROM api_keys"
          )
          .all();
        apiKeys.push(...rows);
      } catch {
        // api_keys table might not exist
      }
      fs.writeFileSync(path.join(tempDir, "api-keys.json"), JSON.stringify(apiKeys, null, 2));

      // 6. Persisted secrets beside the DB (required to decrypt enc:v1: fields on another machine)
      const serverEnvSrc = path.join(DATA_DIR, "server.env");
      let includedServerEnv = false;
      if (fs.existsSync(serverEnvSrc)) {
        fs.copyFileSync(serverEnvSrc, path.join(tempDir, "server.env"));
        includedServerEnv = true;
      }

      fs.writeFileSync(path.join(tempDir, "RESTORE_README.txt"), RESTORE_README, "utf8");

      // 7. Export metadata
      const metadata = {
        exportedAt: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        format: "routiform-full-backup-v2",
        includedServerEnv,
        contents: [
          "storage.sqlite - Full database",
          includedServerEnv ? "server.env - Persisted secrets (STORAGE_ENCRYPTION_KEY, etc.)" : null,
          "RESTORE_README.txt - How to restore on another machine",
          "settings.json - Key-value settings",
          "combos.json - Combo configurations",
          "providers.json - Provider connections (no credentials)",
          "api-keys.json - API key metadata (masked)",
        ].filter(Boolean) as string[],
      };
      fs.writeFileSync(path.join(tempDir, "metadata.json"), JSON.stringify(metadata, null, 2));

      execSync(`tar -czf "${tarPath}" -C "${path.dirname(tempDir)}" "${path.basename(tempDir)}"`, {
        timeout: 30000,
      });

      // Read the archive
      const archiveBuffer = fs.readFileSync(tarPath);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.unlinkSync(tarPath);

      return new NextResponse(archiveBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="routiform-full-backup-${timestamp}.tar.gz"`,
          "Content-Length": archiveBuffer.length.toString(),
        },
      });
    } catch (innerError) {
      // Cleanup on error
      try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
      } catch {
        /* ignore cleanup errors */
      }
      throw innerError;
    }
  } catch (error: unknown) {
    console.error("[ExportAll] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create full export",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
