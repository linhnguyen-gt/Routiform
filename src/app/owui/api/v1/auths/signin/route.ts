import { NextResponse } from "next/server";

import { sessionUser } from "../session-user";

/**
 * `POST /owui/api/v1/auths/signin`
 *
 * With `features.auth = false`, Open WebUI's auth page auto-submits an EMPTY signin on
 * mount (routes/auth/+page.svelte:211) and expects a session user back. That is the only
 * reason this route exists — there is no password to check here, and it must not pretend
 * there is: `src/proxy.ts` already refused the request if Routiform's own session cookie
 * was missing.
 */
export const dynamic = "force-dynamic";

export function POST() {
  return NextResponse.json(sessionUser());
}
