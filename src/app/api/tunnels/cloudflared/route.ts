import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";
import {
  getCloudflaredTunnelStatus,
  startCloudflaredTunnel,
  stopCloudflaredTunnel,
} from "@/lib/cloudflaredTunnel";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["enable", "disable"]),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await isHostSecretAuthenticated(request))) {
    return unauthorized();
  }

  try {
    const status = await getCloudflaredTunnelStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load cloudflared tunnel status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await isHostSecretAuthenticated(request))) {
    return unauthorized();
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateBody(actionSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const parsed = validation.data;

  try {
    const status =
      parsed.action === "enable" ? await startCloudflaredTunnel() : await stopCloudflaredTunnel();

    return NextResponse.json({
      success: true,
      action: parsed.action,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update cloudflared tunnel",
      },
      { status: 500 }
    );
  }
}
