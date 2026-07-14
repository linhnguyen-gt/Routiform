import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /owui/api/v1/audio/config` — the admin Audio settings panel's probe, distinct from the
 * `audio` block in `/owui/api/config`'s response that the chat Settings > Audio panel actually
 * reads (`$config.audio`). Values mirror that block: `tts.engine: ""` and `stt.engine: "web"`
 * put both surfaces in the browser's own speechSynthesis / SpeechRecognition, so there is no
 * server-side provider config to expose. Keep the two in sync if that block ever changes.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json({
    tts: { engine: "", voice: "" },
    stt: { engine: "web" },
  });
}
