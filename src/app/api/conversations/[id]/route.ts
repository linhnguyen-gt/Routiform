import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse } from "@/lib/api/errorResponse";
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from "@/lib/db/chat";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) {
    return createErrorResponse({
      status: 404,
      message: "Conversation not found",
      type: "invalid_request",
    });
  }

  return Response.json({ conversation, messages: listMessages(id) });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;

  let body: { title?: unknown; model?: unknown; provider?: unknown; systemPrompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  // Written out rather than using a `string | null` union inline: this project's
  // tsconfig has strictNullChecks off, so TS does not narrow `unknown` through
  // an `x === null` check and the union collapses back to `unknown`.
  const toNullableString = (value: unknown): string | null | undefined => {
    if (typeof value === "string") return value;
    if (value === null) return null;
    return undefined;
  };

  const conversation = updateConversation(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    provider: toNullableString(body.provider),
    systemPrompt: toNullableString(body.systemPrompt),
  });

  if (!conversation) {
    return createErrorResponse({
      status: 404,
      message: "Conversation not found",
      type: "invalid_request",
    });
  }

  return Response.json({ conversation });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!deleteConversation(id)) {
    return createErrorResponse({
      status: 404,
      message: "Conversation not found",
      type: "invalid_request",
    });
  }

  return Response.json({ deleted: true });
}
