/**
 * API Authentication Guard — Shared utility for protecting management API routes.
 *
 * Provides dual-mode auth: JWT cookie (dashboard session) or Bearer API key.
 * Used by the middleware (proxy.ts) to guard /api/* management routes.
 *
 * @module shared/utils/apiAuth
 */

import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/localDb";
import { getJwtSecret } from "@/shared/utils/jwtSecret";

// ──────────────── Public Routes (No Auth Required) ────────────────

/**
 * Routes that are ALWAYS accessible without authentication.
 * Pattern matching: startsWith check against the pathname.
 */
const PUBLIC_API_ROUTES = [
  // Auth flow — must be accessible to unauthenticated users
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",

  // Settings check — used by login page / onboarding
  "/api/settings/require-login",

  // Init — first-run setup
  "/api/init",

  // Health monitoring — probes must work without auth
  "/api/monitoring/health",

  // Public model catalog (mirrors OpenRouter GET /api/v1/models — no secrets)
  "/api/models/openrouter-catalog",

  // LLM proxy routes — use their own API key auth in the SSE layer
  "/api/v1/",

  // Cloud routes — use Bearer API key auth internally
  "/api/cloud/",

  // OAuth callback routes — provider redirects back here
  "/api/oauth/",
];

// ──────────────── Auth Verification ────────────────

/**
 * Session token shared by verifyAuth and hasValidSessionToken.
 *
 * Named alias for NextRequest's documented .cookies contract: middleware passes NextRequest,
 * but route handlers/tests may hold a plain Request with only the raw header.
 */
function extractSessionToken(request: Request): string | undefined {
  const maybeNextRequest = request as Request & {
    cookies?: { get: (name: string) => { value: string } | undefined };
  };
  return (
    maybeNextRequest.cookies?.get("auth_token")?.value ||
    /(?:^|;\s*)auth_token=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1]
  );
}

/**
 * True when the request carries a valid dashboard SESSION JWT (parsed cookies or raw header).
 *
 * Deliberately excludes Bearer API keys: those are gateway credentials handed to inference
 * clients (Cursor, Cline, any /v1 consumer) and must never satisfy operator-only surfaces
 * such as rotating the dashboard password or toggling auth requirements. Same policy as
 * isHostSecretAuthenticated, expressed against the request instead of next/headers cookies()
 * so handlers invoked outside a Next request context (tests, direct calls) still work.
 */
export async function hasValidSessionToken(request: Request): Promise<boolean> {
  const token = extractSessionToken(request);
  if (!token) return false;
  try {
    await jwtVerify(token, getJwtSecret());
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a request is authenticated via JWT cookie or Bearer API key.
 *
 * @returns null if authenticated, error message string if not
 */
export async function verifyAuth(request: Request): Promise<string | null> {
  // 1. Check JWT cookie (dashboard session)
  // Verify against the same secret the login route mints with. Gating on process.env.JWT_SECRET
  // meant a deployment that left it unset minted tokens through getJwtSecret's auto-generated
  // secret which this path would then never validate.
  const token = extractSessionToken(request);
  if (token) {
    try {
      await jwtVerify(token, getJwtSecret());
      return null; // ✔ Authenticated via cookie
    } catch {
      // Invalid/expired token — fall through to API key check
    }
  }

  // 2. Check Bearer API key
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      // Dynamic import to avoid circular dependencies during build
      const { validateApiKey } = await import("@/lib/db/apiKeys");
      const isValid = await validateApiKey(apiKey);
      if (isValid) return null; // ✔ Authenticated via API key
    } catch {
      // DB not ready or import error — deny access
    }
  }

  return "Authentication required";
}

/**
 * Check if a request is authenticated — boolean convenience wrapper for route handlers.
 *
 * Uses `cookies()` from next/headers (App Router compatible) and Bearer API key.
 * Returns true if authenticated, false otherwise.
 *
 * Unlike `verifyAuth`, this does NOT check `isAuthRequired()` — callers that
 * need to conditionally skip auth should check that separately.
 */
export async function isAuthenticated(request: Request): Promise<boolean> {
  // If settings say login/auth is disabled, treat all requests as authenticated
  if (!(await isAuthRequired())) {
    return true;
  }
  return hasValidCredential(request);
}

/**
 * Credential check for routes that must never be satisfied by "auth is not required".
 *
 * `isAuthenticated` short-circuits to true whenever `isAuthRequired()` is false — which happens on
 * any install with `requireLogin: false`, and on any install where onboarding skipped the password.
 * That is acceptable for read surfaces, but not for routes that mint API keys or write upstream
 * OAuth credentials: those sit behind the `/api/v1/` and `/api/oauth/` public prefixes, so
 * `proxy.ts` returns before `verifyAuth` runs and no Bearer token is ever inspected.
 */
export async function isPrivilegedAuthenticated(request: Request): Promise<boolean> {
  return hasValidCredential(request);
}

/**
 * Credential check for routes that read secrets belonging to the host machine — a local IDE's
 * stored OAuth tokens, for example.
 *
 * Stricter than `isPrivilegedAuthenticated` in one specific way: a gateway API key never satisfies
 * it. Those keys are handed to inference clients (Cursor, Cline, any `/v1` consumer) and live in
 * the same key space `validateApiKey` checks, so accepting one here would let a key issued for
 * chat completions read the operator's upstream credentials off disk.
 *
 * A dashboard session cookie is the primary proof. Installs with `requireLogin: false` have no
 * session to prove, so same-origin is the only signal left — which is what the browser actually
 * sends, and what a bare `curl` with a Bearer token does not.
 */
export async function isHostSecretAuthenticated(request: Request): Promise<boolean> {
  if (await hasValidSessionCookie()) return true;
  if (await isAuthRequired()) return false;
  return isSameOriginRequest(request);
}

/**
 * True when the request carries a valid dashboard session cookie. Unlike `hasValidCredential`,
 * a Bearer API key does not satisfy this.
 */
async function hasValidSessionCookie(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return false;
    await jwtVerify(token, getJwtSecret());
    return true;
  } catch {
    // Invalid/expired token or cookies not available
    return false;
  }
}

/**
 * True when the request demonstrably originated from a page served by this origin.
 *
 * `Sec-Fetch-Site` is the reliable signal and every current browser sends it. `Referer` is the
 * fallback for clients that do not. Absent both, the answer is no: an origin that cannot be
 * established is not the dashboard.
 */
function isSameOriginRequest(request: Request): boolean {
  // A handler invoked without a Request has no origin to establish, so the answer is no. Throwing
  // here would turn a missing credential into a 500.
  if (!request?.headers) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const host = request.headers.get("host");
  if (!host) return false;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

async function hasValidCredential(request: Request): Promise<boolean> {
  // 1. Check API key (for external clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      const { validateApiKey } = await import("@/lib/db/apiKeys");
      if (await validateApiKey(apiKey)) return true;
    } catch {
      // DB not ready or import error
    }
  }

  // 2. Check JWT cookie (for dashboard session)
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (token) {
      await jwtVerify(token, getJwtSecret());
      return true;
    }
  } catch {
    // Invalid/expired token or cookies not available
  }

  return false;
}

/**
 * Check if a route is in the public (no-auth) allowlist.
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Check if authentication is required based on settings.
 * If requireLogin is false AND no password is set, auth is skipped.
 */
export async function isAuthRequired(): Promise<boolean> {
  try {
    const settings = await getSettings();
    if (settings.requireLogin === false) return false;
    // Fresh installs only: before onboarding completes there is nothing to authenticate against,
    // so first run has to be reachable.
    //
    // The `!setupComplete` term is load-bearing and used to be missing here, which made `/api/*`
    // strictly looser than `/dashboard/*`. proxy.ts has always required it (#151): a password that
    // was set and then lost leaves setupComplete=true with no password, and without this term that
    // state handed the entire management API to an unauthenticated caller — including the routes
    // that mint API keys. The dashboard in that state admits only /dashboard/settings; the API now
    // matches, admitting only the settings surface via the carve-out in proxy.ts.
    //
    // Recovering from a lost password is the reset-password CLI tool (bin/reset-password.mjs),
    // not an open API.
    if (!settings.setupComplete && !settings.password && !process.env.INITIAL_PASSWORD) {
      return false;
    }
    return true;
  } catch (error: unknown) {
    // On error, require auth (secure by default)
    // Log the error so failures (e.g., SQLITE_BUSY) aren't silent 401s
    console.error(
      "[API_AUTH_GUARD] isAuthRequired failed, defaulting to true:",
      (error as Error)?.message || error
    );
    return true;
  }
}
