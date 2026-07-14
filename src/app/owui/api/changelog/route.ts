import { NextResponse } from "next/server";

/** `GET /owui/api/changelog` — Open WebUI's "What's new" modal. Nothing to announce. */
export function GET() {
  return NextResponse.json({});
}
