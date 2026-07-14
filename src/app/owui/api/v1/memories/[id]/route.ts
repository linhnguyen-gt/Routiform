import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { deleteMemory } from "@/lib/db/owui-memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!deleteMemory(id)) {
    return createErrorResponse({ status: 404, message: "Memory not found", type: "not_found" });
  }

  return Response.json({ success: true });
}
