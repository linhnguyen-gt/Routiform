import { NextResponse } from "next/server";
import { ensureCliConfigWriteAllowed } from "@/shared/services/cliRuntime";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";
import { CodexAuthFileError, writeCodexAuthFileToLocalCli } from "@/lib/oauth/utils/codexAuthFile";

function toErrorResponse(error: unknown) {
  if (error instanceof CodexAuthFileError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Failed to apply Codex auth file";
  return NextResponse.json({ error: message }, { status: 500 });
}

// Writes an OAuth credential file into the host's Codex CLI directory.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard, code: "writes_disabled" }, { status: 403 });
    }

    const { id } = await params;
    const result = await writeCodexAuthFileToLocalCli(id);

    return NextResponse.json({
      success: true,
      connectionId: id,
      connectionLabel: result.connectionLabel,
      authPath: result.authPath,
      writtenAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Codex Auth Apply] Failed:", error);
    return toErrorResponse(error);
  }
}
