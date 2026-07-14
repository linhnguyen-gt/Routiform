import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open WebUI's functions — a plugin surface Routiform does not implement.
 *
 * An empty list, not a 404: the SPA fetches this on boot, and a 404 shows the user an error
 * toast for a feature they never asked for.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;
  return Response.json([]);
}
