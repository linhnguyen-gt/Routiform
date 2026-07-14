import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getOwuiSettings, saveOwuiSettings } from "@/lib/db/owui-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /owui/api/v1/users/user/info/update` — merged, not replaced: `getAndUpdateUserLocation`
 * calls this with only `{location}`, and a wholesale replace would erase any other info key on
 * every geolocation refresh.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return createErrorResponse({
      status: 400,
      message: "Expected an info object",
      type: "invalid_request",
    });
  }

  const settings = getOwuiSettings();
  const existing =
    typeof settings.userInfo === "object" && settings.userInfo !== null
      ? (settings.userInfo as Record<string, unknown>)
      : {};
  const merged = { ...existing, ...(body as Record<string, unknown>) };
  saveOwuiSettings({ ...settings, userInfo: merged });

  return Response.json(merged);
}
