import { NextResponse } from "next/server";

/** `GET /owui/api/v1/configs/banners` — admin broadcast banners. Routiform has none. */
export function GET() {
  return NextResponse.json([]);
}
