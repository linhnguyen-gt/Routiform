import { NextResponse } from "next/server";

/**
 * `GET /owui/api/v1/tools` — Open WebUI's Python tool plugins.
 *
 * Empty by design, not by omission: tools are arbitrary server-side Python, which is
 * exactly the runtime this integration exists to avoid shipping.
 */
export function GET() {
  return NextResponse.json([]);
}
