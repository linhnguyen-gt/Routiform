import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tags are not implemented. See owui/api/v1/chats/[id]/tags. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;
  return Response.json([]);
}
