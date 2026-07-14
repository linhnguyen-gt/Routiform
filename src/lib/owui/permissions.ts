/**
 * What the embedded chat is allowed to do — declared ONCE.
 *
 * Open WebUI hands the SPA two copies of this: `config.permissions` (the defaults) and
 * `user.permissions` (the per-user set, off `GET /api/v1/auths/`). Components read whichever the
 * author reached for, and most reach for `$user.permissions`. So two hand-maintained copies do not
 * merely risk drift — the stale one silently wins. That is exactly what happened here: the config
 * copy was updated to enable sharing and speech, the session-user copy was not, and every one of
 * those buttons stayed hidden with nothing in the logs to say why.
 *
 * A flag is `true` ONLY where a route actually backs it. A `true` with no endpoint behind it is
 * the dead-button problem this module exists to prevent.
 *
 * @module lib/owui/permissions
 */

export const OWUI_PERMISSIONS = {
  chat: {
    controls: true,
    file_upload: true,
    delete: true,
    edit: true,
    temporary: true,

    // Backed by owui/api/v1/chats/{id}/share and friends. Authenticated-only: /owui sits behind
    // Routiform's session cookie (src/proxy.ts), so a share link is reachable by whoever can
    // already open the app — it is not a public URL.
    share: true,

    // Backed by owui/api/v1/chats/all and .../all/archived.
    export: true,
    import: true,

    // No backend at all: config.audio pins tts.engine="" and stt.engine="web", which makes the
    // SPA use the browser's own speechSynthesis / SpeechRecognition.
    stt: true,
    tts: true,
    call: true,

    multiple_models: false,
  },

  features: {
    // Backed by owui_memories + lib/owui/memory-context.ts, which injects them as a system turn.
    memories: true,
    // Backed by owui/api/v1/auths/api_key, which hands out a REAL Routiform proxy key.
    api_keys: true,

    web_search: false,
    image_generation: false,
    code_interpreter: false,
    notes: false,
  },

  workspace: {
    models: false,
    knowledge: false,
    prompts: false,
    tools: false,
  },
} as const;
