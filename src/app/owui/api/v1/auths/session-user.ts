/**
 * The single synthetic Open WebUI user.
 *
 * Open WebUI ships a full multi-user system (users table, roles, groups, per-user
 * permissions). Routiform does not have one: it is a single-operator gateway behind one
 * password, and `src/proxy.ts` is what actually decides whether you are allowed in.
 *
 * So rather than port a user system we do not want, the SPA is run with `features.auth =
 * false` and every auth endpoint hands back this one fixed identity. The token is inert —
 * nothing verifies it, because by the time a request reaches here the middleware has
 * already checked Routiform's own `auth_token` cookie. Do NOT start trusting this token as
 * a credential; it would be a bearer token that anyone can mint.
 */

import { getOwuiSettings } from "@/lib/db/owui-settings";
import { OWUI_PERMISSIONS } from "@/lib/owui/permissions";

export const OWUI_USER_ID = "routiform-local";

export interface OwuiSessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  profile_image_url: string;
  token: string;
  token_type: string;
  expires_at: number | null;
  permissions: Record<string, unknown>;
}

const DEFAULT_NAME = "You";
const DEFAULT_AVATAR = "/owui/static/favicon.png";

/**
 * The name and avatar the user set in the Account tab.
 *
 * Kept under `accountProfile`, NOT `ui`: `users/user/settings/update` rewrites the whole `ui` key
 * on every preference change, so a profile stored there would be wiped by the next toggle.
 *
 * Reading it back here is what makes the Save button hold. Account.svelte calls `getSessionUser()`
 * immediately after saving to refresh `$user`; if this returned the hardcoded defaults, the name
 * the user just typed would visibly revert a moment later, and the save would look broken while
 * actually having succeeded.
 */
function savedProfile(): { name: string; profile_image_url: string } {
  const stored = getOwuiSettings().accountProfile;
  if (typeof stored !== "object" || stored === null) {
    return { name: DEFAULT_NAME, profile_image_url: DEFAULT_AVATAR };
  }

  const profile = stored as Record<string, unknown>;
  const name =
    typeof profile.name === "string" && profile.name.trim() !== "" ? profile.name : DEFAULT_NAME;
  const avatar =
    typeof profile.profile_image_url === "string" && profile.profile_image_url !== ""
      ? profile.profile_image_url
      : DEFAULT_AVATAR;

  return { name, profile_image_url: avatar };
}

/** Mirrors what the SPA reads off `$user` and `$user.permissions`. */
export function sessionUser(): OwuiSessionUser {
  const profile = savedProfile();

  return {
    id: OWUI_USER_ID,
    email: "local@routiform",
    name: profile.name,

    // "user", NOT "admin" — and this is load-bearing.
    //
    // In Open WebUI, `admin` does not mean "the person who owns this box". It means "there is a
    // full administrator backend behind me": the SPA unconditionally renders Workspace
    // (Sidebar.svelte:127), Playground, the Admin Panel (UserMenu.svelte:256) and Admin Settings
    // (SettingsModal.svelte:861) for an admin, with no feature flag to switch any of them off.
    // Routiform has none of those backends, so claiming the role opened four doors into 404s —
    // which is exactly how the workspace link came to exist.
    //
    // Everything we DO support is granted explicitly through permissions instead, so nothing is
    // lost by dropping the role. It also stops the Account tab printing the "JWT Token" panel,
    // which would have shown an inert string as though it were a credential.
    role: "user",

    profile_image_url: profile.profile_image_url,

    // Inert. See the note above.
    token: "routiform-local",
    token_type: "Bearer",
    expires_at: null,

    // One shared declaration, deliberately. The SPA reads permissions off BOTH `$config` and
    // `$user`, and a second copy maintained here drifted out of sync with the config route once
    // already — silently hiding every button it disagreed about. See lib/owui/permissions.ts.
    permissions: OWUI_PERMISSIONS,
  };
}
