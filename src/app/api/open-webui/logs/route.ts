import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { getOpenWebuiLogTail } from "@/lib/open-webui/manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lines = await getOpenWebuiLogTail(40);
    return NextResponse.json({ lines });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Open WebUI log" },
      { status: 500 }
    );
  }
}
