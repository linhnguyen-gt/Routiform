import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { abortTask } from "@/lib/owui/chat-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Stop button, for a chat that has not been saved yet.
 *
 * Aborting only stops Routiform from RENDERING the rest of the turn. The router does not
 * thread the abort signal through to the provider (src/sse/handlers/chat.ts has no signal
 * plumbing), so the upstream call keeps running and keeps billing. The same caveat already
 * applies to the React chat's stop button; do not let the UI claim otherwise.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;

  if (!abortTask(id)) {
    return createErrorResponse({ status: 404, message: "Task not found", type: "invalid_request" });
  }

  return Response.json({ status: true });
}
