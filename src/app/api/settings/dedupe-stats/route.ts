import { NextResponse } from "next/server";
import {
  getDedupConfig,
  getDedupCounters,
  resetDedupCounters,
} from "../../../../../open-sse/services/requestDedup";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  return NextResponse.json(
    {
      config: getDedupConfig(),
      counters: getDedupCounters(),
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function DELETE() {
  resetDedupCounters();
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
