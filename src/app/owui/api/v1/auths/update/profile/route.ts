import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getOwuiSettings, saveOwuiSettings } from "@/lib/db/owui-settings";

import { sessionUser } from "../../session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /owui/api/v1/auths/update/profile` — Account tab's Save button.
 *
 * Persisted under the `accountProfile` key, not `ui`: the settings blob's `ui` key is the SPA's
 * own client-preferences object (users/user/settings/route.ts saves `{ui: $settings}` wholesale)
 * and would be clobbered by that endpoint's next write if this shared the same key.
 *
 * `sessionUser()` reads the same key back, which is what makes the save stick: Account.svelte
 * calls `getSessionUser()` right after this returns, and a session user built from hardcoded
 * defaults would visibly revert the name the user just typed.
 *
 * Account.svelte also sends `bio`, `gender`, and `date_of_birth`. Routiform has no user record to
 * hang them on — the session user is synthetic (see ../../session-user.ts) — so they are accepted
 * and dropped rather than half-stored.
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

  if (typeof body !== "object" || body === null) {
    return createErrorResponse({
      status: 400,
      message: "Expected a profile object",
      type: "invalid_request",
    });
  }

  const { name, profile_image_url: profileImageUrl } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) {
    return createErrorResponse({
      status: 400,
      message: "name must be a non-empty string",
      type: "invalid_request",
    });
  }
  if (profileImageUrl !== undefined && typeof profileImageUrl !== "string") {
    return createErrorResponse({
      status: 400,
      message: "profile_image_url must be a string",
      type: "invalid_request",
    });
  }

  const profile = { name: name.trim(), profile_image_url: profileImageUrl ?? "" };
  saveOwuiSettings({ ...getOwuiSettings(), accountProfile: profile });

  return Response.json({ ...sessionUser(), ...profile });
}
