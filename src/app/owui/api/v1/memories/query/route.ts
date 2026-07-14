import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listMemories, type OwuiMemory } from "@/lib/db/owui-memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toSeconds = (ms: number): number => Math.floor(ms / 1000);

function memoryToDto(memory: OwuiMemory): Record<string, unknown> {
  return {
    id: memory.id,
    content: memory.content,
    created_at: toSeconds(memory.created_at),
    updated_at: toSeconds(memory.updated_at),
  };
}

/**
 * `POST /owui/api/v1/memories/query` — `queryMemory` is exported by the SPA's API client but
 * never called from any component; this exists only to honor the contract if that changes.
 * Routiform has no embedder, so there is no similarity ranking to fake: this returns every
 * memory, unranked, identically to `GET /memories/`, rather than inventing a fake distance score.
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

  const content =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).content
      : undefined;
  if (typeof content !== "string" || content.trim().length === 0) {
    return createErrorResponse({
      status: 400,
      message: "content must be a non-empty string",
      type: "invalid_request",
    });
  }

  return Response.json(listMemories().map(memoryToDto));
}
