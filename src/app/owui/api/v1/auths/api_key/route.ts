import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createApiKey, deleteApiKey, getApiKeys } from "@/lib/db/apiKeys";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/owui/api/v1/auths/api_key` — backed by Routiform's REAL key store (lib/db/apiKeys.ts), not
 * a synthetic one. That key grants access to Routiform's OpenAI-compatible proxy — the same
 * trust boundary as every other dashboard-issued key — so returning its plaintext here is not a
 * new exposure, unlike upstream Open WebUI where this is a per-account credential.
 *
 * A single key named "Open WebUI" is reused across GET/POST/DELETE. Never resolve or return a
 * key with any other name — that would leak an unrelated credential into the chat UI.
 */
const OWUI_API_KEY_NAME = "Open WebUI";

type ApiKeyRecord = Awaited<ReturnType<typeof getApiKeys>>[number];

async function findOwuiKey(): Promise<ApiKeyRecord | null> {
  const keys = await getApiKeys();
  return keys.find((key) => key.name === OWUI_API_KEY_NAME) ?? null;
}

/** The client reads `res.api_key` directly (auths/index.ts:getAPIKey) — `null` when absent. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const key = await findOwuiKey();
  return Response.json({ api_key: typeof key?.key === "string" ? key.key : null });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const existing = await findOwuiKey();
  if (existing && typeof existing.key === "string") {
    return Response.json({ api_key: existing.key });
  }

  const machineId = await getConsistentMachineId();
  const created = await createApiKey(OWUI_API_KEY_NAME, machineId);
  return Response.json({ api_key: created.key });
}

export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const existing = await findOwuiKey();
  if (existing && typeof existing.id === "string") {
    await deleteApiKey(existing.id);
  }
  return Response.json({ api_key: null });
}
