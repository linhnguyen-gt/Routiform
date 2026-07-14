import { NextResponse } from "next/server";

/** `POST /owui/api/v1/auths/update/timezone` — per-user tz. No user table; accept and drop. */
export function POST() {
  return NextResponse.json({ status: true });
}
