import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public flags for OAuth UI (no secrets). Used by the dashboard to hide
 * browser OAuth for providers that require server-side env.
 *
 * Qoder now uses a self-contained device-token flow (no client_id /
 * client_secret env vars) — always enabled.
 */
export async function GET() {
  return NextResponse.json({
    qoderBrowserOAuthEnabled: true,
  });
}
