import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /owui/api/v1/auths/signout` — the chat's "Sign Out" button.
 *
 * The SPA reads `redirect_url` off this and navigates there (UserMenu.svelte:630, with an `?? '/auth'`
 * fallback). Without this route the POST 404s and the user lands on `/auth` — the SPA's OWN login
 * page, which is disabled here (config `auth:false`), i.e. a dead end. Returning `/dashboard` sends
 * them back to Routiform instead.
 *
 * Deliberately does NOT clear Routiform's `auth_token` cookie. The SPA's own token is inert (see
 * session-user.ts), and /dashboard is auth-gated — clearing the real session would bounce the user
 * to /login, not the dashboard they asked for. This is "leave the chat", not "log out of Routiform".
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json({ redirect_url: "/dashboard" });
}
