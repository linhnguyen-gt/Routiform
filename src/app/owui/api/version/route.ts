import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { OWUI_CONFIG_VERSION } from "@/lib/owui/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The SPA polls this on boot. It 404'd, which is harmless but noisy in the log. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json({ version: OWUI_CONFIG_VERSION });
}
