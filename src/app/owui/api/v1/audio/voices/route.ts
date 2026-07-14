import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /owui/api/v1/audio/voices` — probed by the admin Audio settings panel when its TTS
 * engine select is non-default; the chat Settings > Audio panel never calls it (its `tts.engine`
 * is `""`, so it enumerates `speechSynthesis.getVoices()` in the browser instead — see
 * chat/Settings/Audio.svelte). Routiform ships no server-side TTS provider, so there are no
 * voices to list here.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json({ voices: [] });
}
