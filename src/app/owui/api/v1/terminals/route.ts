import { NextResponse } from "next/server";

/** `GET /owui/api/v1/terminals` — server shell sessions. Never exposed from Routiform. */
export function GET() {
  return NextResponse.json([]);
}
