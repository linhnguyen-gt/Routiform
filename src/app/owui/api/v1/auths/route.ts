import { NextResponse } from "next/server";

import { sessionUser } from "./session-user";

/**
 * `GET /owui/api/v1/auths/` — Open WebUI's `getSessionUser`. Called on every app load to
 * rehydrate `$user`. Same synthetic identity as signin; see ./session-user.ts.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(sessionUser());
}
