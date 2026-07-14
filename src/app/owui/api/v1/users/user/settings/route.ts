import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getOwuiSettings } from "@/lib/db/owui-settings";
import { OWUI_CONFIG_VERSION } from "@/lib/owui/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /owui/api/v1/users/user/settings` — the SPA's client preferences.
 *
 * **The blob is nested under `ui`.** The client saves `{ ui: $settings }` (ModelSelector.svelte:24)
 * and reads it back with `settings.set(userSettings.ui)` ((app)/+layout.svelte:105) — anything at
 * the top level is ignored. Get that wrong and the settings appear to save (200, and they are in
 * the table) while the SPA silently loads none of them.
 *
 * Writes do NOT arrive here; they go to the `settings/update` sibling. An earlier version
 * implemented POST here and held the result in a module variable, so nothing was ever written at
 * all. That mattered more than it sounds: this blob holds **the selected model**, so the selector
 * reset to "Select a model" on every reload and refused to send until the user re-picked one.
 *
 * `ui.version` defaults to the configured version so the "What's New" modal does not fire on a
 * fresh install — the SPA shows it whenever `$settings.version !== $config.version`, and
 * Routiform has no Open WebUI release notes to show.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const stored = getOwuiSettings();
  const ui = (typeof stored.ui === "object" && stored.ui !== null ? stored.ui : {}) as Record<
    string,
    unknown
  >;

  return Response.json({
    ...stored,
    ui: { version: OWUI_CONFIG_VERSION, ...ui },
  });
}
