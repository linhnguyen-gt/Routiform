/**
 * GET /api/models/openrouter-catalog
 * Feature 09 — Retorna catálogo OpenRouter com cache persistente.
 *
 * Query params:
 *   ?refresh=true  — Force-refresh, ignores TTL
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { getOpenRouterCatalog, refreshOpenRouterCatalog } from "@/lib/catalog/openrouterCatalog";

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

  // Public model list (same as OpenRouter's own /api/v1/models). Only force-refresh is gated.
  if (forceRefresh && !(await isAuthenticated(req))) {
    return NextResponse.json(
      { error: { message: "Authentication required", type: "invalid_request_error" } },
      { status: 401 }
    );
  }

  if (forceRefresh) {
    const result = await refreshOpenRouterCatalog();
    return NextResponse.json({
      object: "list",
      data: result.data,
      meta: {
        source: result.ok ? "fresh" : "error",
        count: result.data.length,
        error: result.error ?? undefined,
      },
    });
  }

  const result = await getOpenRouterCatalog();
  return NextResponse.json({
    object: "list",
    data: result.data,
    meta: {
      source: result.fromCache ? (result.stale ? "stale-cache" : "cache") : "fresh",
      cachedAt: result.cachedAt ?? undefined,
      stale: result.stale,
      count: result.data.length,
    },
  });
}
