import { NextResponse } from "next/server";

import { OWUI_PERMISSIONS } from "@/lib/owui/permissions";
import { OWUI_CONFIG_VERSION } from "@/lib/owui/version";

/**
 * `GET /owui/api/config` — the ONE call Open WebUI's SPA makes before it will render
 * anything. Boot-probing the static build against a 404-everything server showed it
 * asks for this and nothing else; every other endpoint is reached only after this
 * answers. So this file is the whole boot gate.
 *
 * Shape mirrors the Python `get_app_config` (open-webui/backend/open_webui/main.py:1823).
 * The `features` map is how the SPA decides which UI to even mount — so a feature we have
 * no backend for is turned OFF here rather than left to 500 later. That is the "strip what
 * we don't need" lever: it is a config flag, not a code deletion.
 *
 * `auth: false` puts the SPA in no-login mode: it will not show a signin page and will not
 * send Authorization headers. Routiform already gates /dashboard behind its own session
 * cookie, so a second login would be redundant — and Open WebUI's user table does not exist
 * here.
 */

export const dynamic = "force-dynamic";

/**
 * Which model a brand-new visitor lands on.
 *
 * Without this the selector opens on "Select a model" and the composer REFUSES TO SEND until
 * the user picks one — and it happens on every reload, because picking a model in the dropdown
 * is session-only upstream (you have to click "Set as default" to persist it). So the very
 * first thing the chat did was block you. `default_models` is upstream's own answer
 * (Chat.svelte:1374, read as a comma-separated string); it just has to be populated.
 */
async function firstAvailableModel(request: Request): Promise<string> {
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/owui/api/models`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return "";

    const { data } = (await res.json()) as { data?: { id?: string }[] };
    return data?.[0]?.id ?? "";
  } catch {
    // A config that fails to load boots nothing at all — an empty default is survivable,
    // a thrown error is not.
    return "";
  }
}

export async function GET(request: Request) {
  return NextResponse.json({
    status: true,
    name: "Routiform",
    version: OWUI_CONFIG_VERSION,
    default_locale: "en-US",
    default_models: await firstAvailableModel(request),

    oauth: { providers: {} },

    features: {
      // MUST be present and false. The client reads `enable_websocket ?? true`
      // (+layout.svelte:1138) and, when true, connects with transports: ['websocket'] ONLY.
      // Routiform's socket.io listener is reached through a Next rewrite, and a rewrite
      // cannot proxy a WebSocket upgrade — so leaving this unset makes the handshake fail
      // and the chat never streams a single token. False gives ['polling', 'websocket'],
      // and polling is plain HTTP, which the rewrite forwards fine.
      enable_websocket: false,

      // Pre-auth surface. `auth: false` => the SPA runs unauthenticated.
      auth: false,
      auth_trusted_header: false,
      enable_signup: false,
      enable_login_form: false,
      enable_ldap: false,
      enable_password_change_form: false,

      // The key handed out here is a REAL Routiform proxy key (owui/api/v1/auths/api_key backs
      // it with lib/db/apiKeys.ts). Same trust boundary as the dashboard — anyone who can reach
      // this page can already mint keys in Routiform's own UI — so surfacing one is not an
      // escalation.
      enable_api_keys: true,

      // Chat is the entire point; everything below it is off until it has a backend.
      enable_direct_connections: false,
      enable_folders: false,
      enable_channels: false,
      enable_notes: false,
      enable_calendar: false,
      enable_automations: false,

      // No RAG, no web search, no image gen, no code execution — Routiform has no
      // embedder, no search provider, and no sandbox. Leaving these on would render
      // buttons that 500 on click.
      enable_web_search: false,
      enable_image_generation: false,
      enable_code_execution: false,
      enable_code_interpreter: false,
      enable_google_drive_integration: false,
      enable_onedrive_integration: false,

      // Backed by owui_memories + lib/owui/memory-context.ts, which injects them as a system
      // turn. Without that injection this flag would only buy a write-only diary.
      enable_memories: true,

      enable_community_sharing: false,
      enable_message_rating: false,
      enable_user_webhooks: false,
      enable_admin_export: false,
      enable_admin_chat_access: false,
      enable_autocomplete_generation: false,
      enable_user_status: false,
    },

    /**
     * Speech, done entirely in the browser.
     *
     * `tts.engine: ""` and `stt.engine: "web"` are upstream's own "Web API" setting: at those
     * values the SPA calls `speechSynthesis` and `SpeechRecognition` directly
     * (ResponseMessage.svelte:250, VoiceRecording.svelte:181) and never touches the network. So
     * read-aloud and voice input work with zero backend — no TTS provider, no Whisper, no wasm.
     *
     * This block is NOT optional. The SPA reads `$config.audio.stt.engine` and
     * `$config.audio.tts.engine` WITHOUT optional chaining, so once the tts/stt permissions below
     * are on, a missing `audio` key throws while rendering the message actions.
     */
    audio: {
      tts: {
        engine: "",
        voice: "",
        split_on: "punctuation",
      },
      stt: {
        engine: "web",
      },
    },

    // Suggestions on the landing screen. Open WebUI expects [{ title: [line1, line2], content }].
    default_prompt_suggestions: [],

    // Shared with the session user (owui/api/v1/auths/), which is the copy most components
    // actually read. Maintaining the two separately drifted once already and silently hid every
    // button they disagreed about — hence the single declaration.
    permissions: OWUI_PERMISSIONS,
  });
}
