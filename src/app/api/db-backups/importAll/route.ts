import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "node:child_process";
import { getDbInstance, resetDbInstance, SQLITE_FILE, DATA_DIR } from "@/lib/db/core";
import { backupDbFile } from "@/lib/db/backup";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB — archive includes DB + JSON

const REQUIRED_TABLES = ["provider_connections", "provider_nodes", "combos", "api_keys"];
const RUNTIME_HOT_RELOAD_SECRET_KEYS = [
  "STORAGE_ENCRYPTION_KEY",
  "STORAGE_ENCRYPTION_KEY_LEGACY",
  "STORAGE_ENCRYPTION_KEYS",
  "STORAGE_ENCRYPTION_KEY_VERSION",
] as const;

const AUTH_SECRET_KEYS = ["JWT_SECRET", "API_KEY_SECRET"] as const;

function parseSimpleEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function applyImportedServerEnvToRuntime(serverEnvPath: string): {
  runtimeSecretsReloaded: boolean;
  runtimeOverrideDetected: boolean;
  authSecretsChanged: boolean;
} {
  const parsed = parseSimpleEnvFile(serverEnvPath);
  const importedPrimary = parsed.STORAGE_ENCRYPTION_KEY?.trim() || "";
  const previousPrimary = process.env.STORAGE_ENCRYPTION_KEY?.trim() || "";

  let runtimeSecretsReloaded = false;
  const runtimeOverrideDetected =
    !!importedPrimary && !!previousPrimary && importedPrimary !== previousPrimary;

  const authSecretsChanged = AUTH_SECRET_KEYS.some((key) => {
    const nextVal = parsed[key]?.trim();
    if (!nextVal) return false;
    const currentVal = process.env[key]?.trim();
    return !!currentVal && currentVal !== nextVal;
  });

  for (const key of RUNTIME_HOT_RELOAD_SECRET_KEYS) {
    const value = parsed[key]?.trim();
    if (!value) continue;
    process.env[key] = value;
    runtimeSecretsReloaded = true;
  }

  for (const key of AUTH_SECRET_KEYS) {
    const value = parsed[key]?.trim();
    if (!value) continue;
    process.env[key] = value;
    runtimeSecretsReloaded = true;
  }

  if (importedPrimary && previousPrimary && importedPrimary !== previousPrimary) {
    const importedLegacy = parsed.STORAGE_ENCRYPTION_KEY_LEGACY?.trim() || "";
    const importedMulti = (parsed.STORAGE_ENCRYPTION_KEYS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const importedCandidates = new Set([importedPrimary, importedLegacy, ...importedMulti]);
    if (!importedCandidates.has(previousPrimary)) {
      process.env.STORAGE_ENCRYPTION_KEY_LEGACY = previousPrimary;
      runtimeSecretsReloaded = true;
    }
  }

  return { runtimeSecretsReloaded, runtimeOverrideDetected, authSecretsChanged };
}

function assertPathInsideRoot(filePath: string, root: string): boolean {
  const r = path.resolve(root);
  const f = path.resolve(filePath);
  if (f === r) return true;
  if (process.platform === "win32") {
    const rl = r.toLowerCase();
    const fl = f.toLowerCase();
    return fl === rl || fl.startsWith(rl + path.sep.toLowerCase());
  }
  return f === r || f.startsWith(r + path.sep);
}

/**
 * Reject tar entries that could escape the extraction directory (zip-slip class).
 */
function validateTarListingSafe(tarPath: string): void {
  const out = execSync(`tar -tzf "${tarPath}"`, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000,
  });
  for (const line of out.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const n = raw.replace(/\/+$/, "").replace(/\\+$/, "");
    if (path.isAbsolute(n)) {
      throw new Error("Unsafe archive: absolute paths are not allowed");
    }
    const segments = n.split(/[/\\]/);
    for (const seg of segments) {
      if (seg === "..") {
        throw new Error("Unsafe archive: path traversal is not allowed");
      }
    }
  }
}

function findFilesRecursive(rootDir: string, basename: string): string[] {
  const results: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name === basename) results.push(p);
    }
  };
  walk(rootDir);
  return results;
}

/**
 * POST /api/db-backups/importAll — Restore from Export All (.tar.gz): storage.sqlite + optional server.env.
 *
 * 🔒 Auth-guarded: requires JWT cookie or Bearer API key.
 */
export async function POST(request: Request) {
  if (await isAuthRequired()) {
    if (!(await isAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!SQLITE_FILE) {
    return NextResponse.json(
      { error: "Import All is only available in local (non-cloud) mode" },
      { status: 400 }
    );
  }

  let tarPath: string | null = null;
  let extractDir: string | null = null;

  try {
    let fileBuffer: Buffer | null = null;
    let fileName = "";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided. Upload a .tar.gz backup." },
          { status: 400 }
        );
      }
      fileName = file.name;
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const buffer = await request.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        return NextResponse.json({ error: "No file content provided." }, { status: 400 });
      }
      fileBuffer = Buffer.from(buffer);
      const url = new URL(request.url);
      fileName = url.searchParams.get("filename") || "backup.tar.gz";
    }

    const lower = fileName.toLowerCase();
    if (!lower.endsWith(".tar.gz") && !lower.endsWith(".tgz")) {
      return NextResponse.json(
        { error: "Invalid file type. Only .tar.gz or .tgz archives are accepted." },
        { status: 400 }
      );
    }

    const fileSize = fileBuffer.length;
    if (fileSize > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB.`,
        },
        { status: 400 }
      );
    }

    if (fileSize < 100) {
      return NextResponse.json({ error: "File too small to be a valid archive." }, { status: 400 });
    }

    tarPath = path.join(os.tmpdir(), `routiform-import-all-${Date.now()}.tar.gz`);
    fs.writeFileSync(tarPath, fileBuffer!);
    validateTarListingSafe(tarPath);

    extractDir = path.join(os.tmpdir(), `routiform-extract-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, {
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });

    const sqliteCandidates = findFilesRecursive(extractDir, "storage.sqlite").filter((p) =>
      assertPathInsideRoot(p, extractDir!)
    );
    if (sqliteCandidates.length === 0) {
      return NextResponse.json(
        { error: "No storage.sqlite found in archive. Use Export All from Routiform." },
        { status: 400 }
      );
    }
    if (sqliteCandidates.length > 1) {
      return NextResponse.json(
        { error: "Multiple storage.sqlite files in archive; expected exactly one." },
        { status: 400 }
      );
    }

    const sqliteFromArchive = sqliteCandidates[0];
    let testDb: InstanceType<typeof Database> | null = null;
    try {
      testDb = new Database(sqliteFromArchive, { readonly: true });
      const result = testDb.pragma("integrity_check") as { integrity_check?: string }[];
      if (result[0]?.integrity_check !== "ok") {
        return NextResponse.json(
          { error: "Database integrity check failed. The archive may be corrupted." },
          { status: 400 }
        );
      }
      const tables = testDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: { name: string }) => row.name);
      const missingTables = REQUIRED_TABLES.filter((t) => !tables.includes(t));
      if (missingTables.length > 0) {
        return NextResponse.json(
          {
            error: `Invalid Routiform database. Missing tables: ${missingTables.join(", ")}`,
          },
          { status: 400 }
        );
      }
      testDb.close();
      testDb = null;
    } catch (e: unknown) {
      if (testDb) testDb.close();
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Invalid database in archive: ${msg}` }, { status: 400 });
    }

    const serverEnvCandidates = findFilesRecursive(extractDir, "server.env").filter((p) =>
      assertPathInsideRoot(p, extractDir!)
    );
    let importedServerEnv = false;
    let runtimeSecretsReloaded = false;
    let runtimeOverrideDetected = false;
    let authSecretsChanged = false;
    if (serverEnvCandidates.length > 1) {
      return NextResponse.json(
        { error: "Multiple server.env files in archive; expected at most one." },
        { status: 400 }
      );
    }
    if (serverEnvCandidates.length === 1) {
      const srcEnv = serverEnvCandidates[0];
      const destEnv = path.join(DATA_DIR, "server.env");
      if (fs.existsSync(destEnv)) {
        const bak = path.join(DATA_DIR, `server.env.pre-import-${Date.now()}`);
        fs.copyFileSync(destEnv, bak);
      }
      fs.copyFileSync(srcEnv, destEnv);
      importedServerEnv = true;
      const runtimeApply = applyImportedServerEnvToRuntime(destEnv);
      runtimeSecretsReloaded = runtimeApply.runtimeSecretsReloaded;
      runtimeOverrideDetected = runtimeApply.runtimeOverrideDetected;
      authSecretsChanged = runtimeApply.authSecretsChanged;
    }

    backupDbFile("pre-import-all");

    resetDbInstance();

    const sqliteFilesToReplace = [
      SQLITE_FILE,
      `${SQLITE_FILE}-wal`,
      `${SQLITE_FILE}-shm`,
      `${SQLITE_FILE}-journal`,
    ];
    for (const filePath of sqliteFilesToReplace) {
      if (!filePath) continue;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    fs.copyFileSync(sqliteFromArchive, SQLITE_FILE);

    const db = getDbInstance();
    const connCount =
      (db.prepare("SELECT COUNT(*) as cnt FROM provider_connections").get() as { cnt: number })
        ?.cnt || 0;
    const nodeCount =
      (db.prepare("SELECT COUNT(*) as cnt FROM provider_nodes").get() as { cnt: number })?.cnt || 0;
    const comboCount =
      (db.prepare("SELECT COUNT(*) as cnt FROM combos").get() as { cnt: number })?.cnt || 0;
    const keyCount =
      (db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get() as { cnt: number })?.cnt || 0;

    console.log(
      `[DB] Import-all from ${fileName}: ${connCount} connections, ${nodeCount} nodes, ${comboCount} combos, ${keyCount} API keys; server.env: ${importedServerEnv ? "yes" : "no"}; runtime secrets reloaded: ${runtimeSecretsReloaded ? "yes" : "no"}`
    );
    if (runtimeOverrideDetected) {
      console.warn(
        "[DB] Import-all detected a different STORAGE_ENCRYPTION_KEY in current runtime; switched runtime to imported server.env key and moved previous key to STORAGE_ENCRYPTION_KEY_LEGACY for compatibility."
      );
    }

    return NextResponse.json({
      imported: true,
      filename: fileName,
      importedServerEnv,
      runtimeSecretsReloaded,
      runtimeOverrideDetected,
      authSecretsChanged,
      connectionCount: connCount,
      nodeCount,
      comboCount,
      apiKeyCount: keyCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Error importing full backup:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tarPath && fs.existsSync(tarPath)) {
      try {
        fs.unlinkSync(tarPath);
      } catch {
        /* best effort */
      }
    }
    if (extractDir && fs.existsSync(extractDir)) {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}
