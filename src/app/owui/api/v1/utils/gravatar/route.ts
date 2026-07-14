import crypto from "crypto";

import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /owui/api/v1/utils/gravatar?email=` — returns the URL as a bare JSON string, not
 * `{url}`. UserProfileImage.svelte does `profileImageUrl = await getGravatarUrl(...)` and
 * assigns the result straight to an `<img src>`, mirroring upstream's FastAPI handler which
 * returns a plain string body — an object here would render as `[object Object]`.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return createErrorResponse({
      status: 400,
      message: "email query parameter is required",
      type: "invalid_request",
    });
  }

  const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return Response.json(`https://www.gravatar.com/avatar/${hash}?d=mp`);
}
