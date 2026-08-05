import { NextResponse } from "next/server";
import { listDbBackups, restoreDbBackup, backupDbFileBlocking } from "@/lib/localDb";
import { dbBackupRestoreSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

/**
 * PUT /api/db-backups — Trigger a manual backup snapshot.
 */
export async function PUT(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backupDbFileBlocking("manual");
    if (!result) {
      return NextResponse.json({ message: "No changes since last backup (throttled)" });
    }
    return NextResponse.json({ created: true, ...result });
  } catch (error) {
    console.error("[API] Error creating manual backup:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/db-backups — List available database backups.
 */
export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backups = await listDbBackups();
    return NextResponse.json({ backups });
  } catch (error) {
    console.error("[API] Error listing DB backups:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/db-backups — Restore a specific backup.
 * Body: { backupId: "db_2026-02-11T14-00-00-000Z_pre-write.json" }
 */
export async function POST(request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const validation = validateBody(dbBackupRestoreSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { backupId } = validation.data;

    const result = await restoreDbBackup(backupId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error restoring DB backup:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
