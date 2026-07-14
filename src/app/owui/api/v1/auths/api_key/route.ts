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

/**
 * ALL keys named "Open WebUI", not just the first. `api_keys` has no unique constraint on `name`,
 * so a create/create race (two POSTs both seeing "none exists") can leave duplicates. Resolving
 * every match lets DELETE clean them ALL up — a first-match-only delete would strand an
 * un-removable orphan — and lets POST self-heal any it created a race with.
 */
async function findOwuiKeys(): Promise<ApiKeyRecord[]> {
  const keys = await getApiKeys();
  return keys.filter((key) => key.name === OWUI_API_KEY_NAME);
}

/** The client reads `res.api_key` directly (auths/index.ts:getAPIKey) — `null` when absent. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const [key] = await findOwuiKeys();
  return Response.json({ api_key: typeof key?.key === "string" ? key.key : null });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const existing = await findOwuiKeys();
  if (existing.length > 0 && typeof existing[0].key === "string") {
    return Response.json({ api_key: existing[0].key });
  }

  const machineId = await getConsistentMachineId();
  const created = await createApiKey(OWUI_API_KEY_NAME, machineId);

  // Self-heal a create/create race: if a concurrent POST also inserted one, drop every duplicate
  // except the one we are returning, so the store converges to a single "Open WebUI" key.
  const after = await findOwuiKeys();
  for (const dup of after) {
    if (typeof dup.id === "string" && dup.id !== created.id) {
      await deleteApiKey(dup.id);
    }
  }

  return Response.json({ api_key: created.key });
}

export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  for (const key of await findOwuiKeys()) {
    if (typeof key.id === "string") await deleteApiKey(key.id);
  }
  return Response.json({ api_key: null });
}
