import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { updateMemory, type OwuiMemory } from "@/lib/db/owui-memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEMORY_CONTENT_LENGTH = 4000;

const toSeconds = (ms: number): number => Math.floor(ms / 1000);

function memoryToDto(memory: OwuiMemory): Record<string, unknown> {
  return {
    id: memory.id,
    content: memory.content,
    created_at: toSeconds(memory.created_at),
    updated_at: toSeconds(memory.updated_at),
  };
}

function parseContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_MEMORY_CONTENT_LENGTH) return null;
  return trimmed;
}

type Params = { params: Promise<{ id: string }> };

/** `POST /owui/api/v1/memories/{id}/update` — same `type`/`path` drop as `memories/add`. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
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

  const content =
    typeof body === "object" && body !== null
      ? parseContent((body as Record<string, unknown>).content)
      : null;
  if (content === null) {
    return createErrorResponse({
      status: 400,
      message: `content must be a non-empty string of at most ${MAX_MEMORY_CONTENT_LENGTH} characters`,
      type: "invalid_request",
    });
  }

  const { id } = await params;
  const updated = updateMemory(id, content);
  if (!updated) {
    return createErrorResponse({ status: 404, message: "Memory not found", type: "not_found" });
  }

  return Response.json(memoryToDto(updated));
}
