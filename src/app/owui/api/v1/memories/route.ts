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
 * `GET /owui/api/v1/memories/` — the client does `memories = (await getMemories(...)) ?? []`
 * and reads the result as a bare array (Personalization/ManageModal.svelte), not `{memories}`.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json(listMemories().map(memoryToDto));
}
