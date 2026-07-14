import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getOwuiSettings, saveOwuiSettings } from "@/lib/db/owui-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /owui/api/v1/users/user/settings/update` — where the SPA actually saves.
 *
 * The blob carries the selected model, the theme, and the version of the changelog the user has
 * dismissed. It is replaced wholesale, not merged: the client always sends its complete settings
 * object, so merging would resurrect keys the user just turned off.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ detail: "Expected a settings object" }, { status: 400 });
  }

  saveOwuiSettings(body as Record<string, unknown>);
  return Response.json(getOwuiSettings());
}
