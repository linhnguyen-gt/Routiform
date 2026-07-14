import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getOwuiSettings } from "@/lib/db/owui-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /owui/api/v1/users/user/info` — free-form per-user metadata (upstream's main use is
 * geolocation via `getAndUpdateUserLocation`). Persisted under the `userInfo` key so it cannot
 * collide with the SPA's own `ui` client-preferences blob (see ../settings/route.ts).
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const settings = getOwuiSettings();
  const info =
    typeof settings.userInfo === "object" && settings.userInfo !== null ? settings.userInfo : {};
  return Response.json(info);
}
