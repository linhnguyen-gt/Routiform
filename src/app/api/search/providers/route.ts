import { NextResponse } from "next/server";
import {
  SEARCH_PROVIDERS,
  SEARCH_CREDENTIAL_FALLBACKS,
  isKeylessSearchReady,
} from "@routiform/open-sse/config/searchRegistry.ts";
import { getDbInstance } from "@/lib/db/core";
import { isAuthenticated } from "@/shared/utils/apiAuth";

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getDbInstance();
    const providers = Object.values(SEARCH_PROVIDERS).map((p) => {
      let status: "active" | "no_credentials" = "no_credentials";
      try {
        const cred = db
          .prepare(
            "SELECT id FROM provider_connections WHERE provider = ? AND is_active = 1 LIMIT 1"
          )
          .get(p.id);
        // Use canonical fallback mapping (e.g. perplexity-search → perplexity)
        const fallbackId = SEARCH_CREDENTIAL_FALLBACKS[p.id];
        const fallbackCred =
          !cred && fallbackId
            ? db
                .prepare(
                  "SELECT id FROM provider_connections WHERE provider = ? AND is_active = 1 LIMIT 1"
                )
                .get(fallbackId)
            : null;
        if (cred || fallbackCred || isKeylessSearchReady(p)) status = "active";
      } catch {
        // DB error — report as no_credentials
      }
      return {
        id: p.id,
        name: p.name,
        status,
        cost_per_query: p.costPerQuery,
      };
    });

    return NextResponse.json({ providers });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to list providers" }, { status: 500 });
  }
}
