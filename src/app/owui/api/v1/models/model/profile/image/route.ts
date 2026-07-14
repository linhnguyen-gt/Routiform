import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The model avatar shown on the empty-chat placeholder.
 *
 * Routiform has no per-model artwork, so this always answers with the same mark. It exists
 * because a 404 here is not harmless: the placeholder's `onerror` falls back to the app icon,
 * and if THAT also 404s the handler fires again on the same dead URL — an infinite image-request
 * loop that floods the server. Answering with real bytes ends the chain at the first request.
 */
const AVATAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="32" fill="#6d5ef5"/>
  <path d="M32 16a16 16 0 1 0 0 32 16 16 0 0 0 0-32zm0 6a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" fill="#fff" opacity=".9"/>
</svg>`;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return new Response(AVATAR, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
    },
  });
}
