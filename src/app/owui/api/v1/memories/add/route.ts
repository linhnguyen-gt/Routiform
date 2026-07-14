import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { addMemory, type OwuiMemory } from "@/lib/db/owui-memories";

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

/**
 * `POST /owui/api/v1/memories/add` — MemoryModal.svelte also sends `type` and `path`, but
 * `owui_memories` has no columns for either: it is a separate, simpler table from the proxy's
 * own typed `memories` (see lib/db/owui-memories.ts). Both are accepted and silently dropped so
 * Add still succeeds; the SPA falls back to `type ?? 'user'` when displaying the row back.
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
      ? parseContent((body as Record<string, unknown>).content)
      : null;
  if (content === null) {
    return createErrorResponse({
      status: 400,
      message: `content must be a non-empty string of at most ${MAX_MEMORY_CONTENT_LENGTH} characters`,
      type: "invalid_request",
    });
  }

  return Response.json(memoryToDto(addMemory(content)));
}
