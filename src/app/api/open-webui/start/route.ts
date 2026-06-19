import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { startOpenWebui, getOpenWebuiStatus } from "@/lib/open-webui/manager";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getOpenWebuiStatus();
    if (status.dockerMode) {
      return NextResponse.json({
        success: true,
        status,
        message: "Docker mode — Open WebUI runs as a sibling compose service.",
      });
    }

    const result = await startOpenWebui();
    return NextResponse.json({ success: true, status: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Open WebUI" },
      { status: 500 }
    );
  }
}
