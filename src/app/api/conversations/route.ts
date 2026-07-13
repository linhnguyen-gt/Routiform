import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { createConversation, listConversations } from "@/lib/db/chat";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // Cookie-session only — a Bearer router API key must not read chat history.
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json({ conversations: listConversations() });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: { model?: unknown; provider?: unknown; systemPrompt?: unknown; title?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  if (typeof body.model !== "string" || !body.model) {
    return createErrorResponse({
      status: 400,
      message: "model is required",
      type: "invalid_request",
    });
  }

  const conversation = createConversation({
    model: body.model,
    provider: typeof body.provider === "string" ? body.provider : null,
    systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : null,
    title: typeof body.title === "string" ? body.title : undefined,
  });

  return Response.json({ conversation }, { status: 201 });
}
