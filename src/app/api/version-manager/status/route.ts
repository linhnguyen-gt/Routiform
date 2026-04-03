"use server";

import { NextResponse } from "next/server";
import { getVersionManagerStatus } from "@/lib/versionManager";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const status = await getVersionManagerStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[version-manager] status error:", error);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
