import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";
import Database from "better-sqlite3";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

/**
 * GET /api/oauth/cursor/auto-import
 * Auto-detect and extract Cursor tokens from local SQLite database.
 *
 * Reads credentials belonging to the host machine, so a gateway API key does not satisfy it:
 * a dashboard session, or same-origin on an install with no login at all.
 */
export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const platform = process.platform;
    let dbPath;

    // Determine database path based on platform
    if (platform === "darwin") {
      dbPath = join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
    } else if (platform === "linux") {
      dbPath = join(homedir(), ".config/Cursor/User/globalStorage/state.vscdb");
    } else if (platform === "win32") {
      dbPath = join(process.env.APPDATA || "", "Cursor/User/globalStorage/state.vscdb");
    } else {
      return NextResponse.json({ error: "Unsupported platform", found: false }, { status: 400 });
    }

    // Try to open database
    let db;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch (_error) {
      return NextResponse.json({
        found: false,
        error:
          "Cursor database not found. Make sure Cursor IDE is installed and you are logged in.",
      });
    }

    try {
      // Extract tokens from database
      const rows = db
        .prepare("SELECT key, value FROM itemTable WHERE key IN (?, ?)")
        .all("cursorAuth/accessToken", "storage.serviceMachineId");

      const tokens: Record<string, string> = {};
      for (const row of rows) {
        if (row.key === "cursorAuth/accessToken") {
          tokens.accessToken = row.value;
        } else if (row.key === "storage.serviceMachineId") {
          tokens.machineId = row.value;
        }
      }

      db.close();

      // Validate tokens exist
      if (!tokens.accessToken || !tokens.machineId) {
        return NextResponse.json({
          found: false,
          error: "Tokens not found in database. Please login to Cursor IDE first.",
        });
      }

      return NextResponse.json({
        found: true,
        accessToken: tokens.accessToken,
        machineId: tokens.machineId,
      });
    } catch (error) {
      db?.close();
      return NextResponse.json({
        found: false,
        error: `Failed to read database: ${(error as Error).message}`,
      });
    }
  } catch (error) {
    console.log("Cursor auto-import error:", error);
    return NextResponse.json({ found: false, error: (error as Error).message }, { status: 500 });
  }
}
