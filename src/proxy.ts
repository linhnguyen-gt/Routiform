import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { generateRequestId } from "./shared/utils/requestId";
import { getSettings } from "./lib/localDb";
import { isPublicRoute, verifyAuth, isAuthRequired } from "./shared/utils/apiAuth";
import { checkBodySize, getBodySizeLimit } from "./shared/middleware/bodySizeGuard";
import { isDraining } from "./lib/gracefulShutdown";
import { isModelSyncInternalRequest } from "./shared/services/modelSyncScheduler";
import { getJwtSecret } from "./shared/utils/jwtSecret";

interface NextRequest extends Request {
  nextUrl: { pathname: string; protocol?: string };
  cookies: { get: (name: string) => { value: string } | undefined };
  headers: Headers;
}

export async function proxy(request: unknown) {
  const req = request as NextRequest;
  const { pathname } = req.nextUrl;

  // Pipeline: Add request ID header for end-to-end tracing
  const requestId = generateRequestId();
  const response = NextResponse.next();
  response.headers.set("X-Request-Id", requestId);

  // ──────────────── Pre-flight: Reject during shutdown drain ────────────────
  if (isDraining() && pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Server is shutting down",
          correlation_id: requestId,
        },
      },
      { status: 503 }
    );
  }

  // ──────────────── Pre-flight: Reject oversized bodies ────────────────
  // Covers BOTH the management API (/api/) and the embedded chat's API (/owui/api/). The latter
  // was originally omitted, which left owui/api/v1/chats/import and the file upload with no body
  // ceiling at all — a booby-trapped import file could stream in unbounded.
  if (
    (pathname.startsWith("/api/") || pathname.startsWith("/owui/api/")) &&
    req.method !== "GET" &&
    req.method !== "OPTIONS"
  ) {
    const bodySizeRejection = checkBodySize(req, getBodySizeLimit(pathname));
    if (bodySizeRejection) return bodySizeRejection;
  }

  // ──────────────── Protect Management API Routes ────────────────
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/")) {
    // Allow public routes (login, logout, health, etc.)
    if (isPublicRoute(pathname)) {
      return response;
    }

    // Allow the model auto-sync scheduler to reach only its internal provider routes.
    if (
      isModelSyncInternalRequest(req) &&
      /^\/api\/providers\/[^/]+\/(sync-models|models)$/.test(pathname)
    ) {
      return response;
    }

    // Allow settings API for initial password configuration when no password exists
    if (pathname === "/api/settings") {
      const settings = await getSettings();
      if (!settings.password && !process.env.INITIAL_PASSWORD) {
        return response;
      }
    }

    // Check if auth is required at all (respects requireLogin setting)
    const authRequired = await isAuthRequired();
    if (!authRequired) {
      return response;
    }

    // Verify authentication (JWT cookie or Bearer API key)
    const authError = await verifyAuth(req);
    if (authError) {
      return NextResponse.json(
        {
          error: {
            code: "AUTH_001",
            message: authError,
            correlation_id: requestId,
          },
        },
        { status: 401 }
      );
    }
  }

  // ──────────────── Protect Dashboard Routes ────────────────
  //
  // `/owui` is the Open WebUI SPA and its backend (`/owui/api/*`). It runs with its own
  // auth DISABLED (see src/app/owui/api/config/route.ts: `features.auth = false`), because
  // Routiform is the session authority — so without this line the entire chat UI, every
  // conversation, and every model call would be reachable with no login at all.
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/owui")) {
    // E2E test bypass: skip auth when E2E_DISABLE_AUTH is set
    if (process.env.E2E_DISABLE_AUTH === "true") {
      return response;
    }

    // The chat moved to /owui. Redirected here rather than from a page component: a
    // `redirect()` inside the (dashboard) layout renders the whole dashboard shell first and
    // then bounces from the CLIENT with a 200, so the user downloads a page they never see.
    // This is a real 307, before anything renders. The sidebar and old bookmarks both land here.
    if (pathname === "/dashboard/chat" || pathname.startsWith("/dashboard/chat/")) {
      return NextResponse.redirect(new URL("/owui", req.url));
    }

    // Always allow onboarding — it has its own setupComplete guard
    if (pathname.startsWith("/dashboard/onboarding")) {
      return response;
    }

    const token = req.cookies.get("auth_token")?.value;

    if (token) {
      try {
        const secret = getJwtSecret();
        if (!secret) {
          throw new Error("JWT_SECRET is not configured");
        }
        const { payload } = await jwtVerify(token, secret);

        // Auto-refresh: if token expires within 7 days, issue a fresh 30-day token
        const exp = payload.exp as number;
        const now = Math.floor(Date.now() / 1000);
        const REFRESH_WINDOW = 7 * 24 * 60 * 60; // 7 days in seconds
        if (exp && exp - now < REFRESH_WINDOW) {
          try {
            const freshToken = await new SignJWT({ authenticated: true })
              .setProtectedHeader({ alg: "HS256" })
              .setExpirationTime("30d")
              .sign(secret);

            // Detect secure context
            const fwdProto = (req.headers.get("x-forwarded-proto") || "")
              .split(",")[0]
              .trim()
              .toLowerCase();
            const isHttps = fwdProto === "https" || req.nextUrl?.protocol === "https:";
            const useSecure = process.env.AUTH_COOKIE_SECURE === "true" || isHttps;

            response.cookies.set("auth_token", freshToken, {
              httpOnly: true,
              secure: useSecure,
              sameSite: "lax",
              path: "/",
            });
            console.log(
              `[Middleware] JWT auto-refreshed for ${pathname} (was expiring in ${Math.round((exp - now) / 3600)}h)`
            );
          } catch (refreshErr) {
            // Refresh failed — continue with existing valid token
            const errMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
            console.error("[Middleware] JWT auto-refresh failed:", errMsg);
          }
        }

        return response;
      } catch (err) {
        // FASE-01: Log auth errors instead of silently redirecting
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[Middleware] auth_error: JWT verification failed:", errMsg, {
          path: pathname,
          tokenPresent: true,
          requestId,
        });

        const redirectResponse = NextResponse.redirect(new URL("/login", req.url));
        redirectResponse.cookies.set("auth_token", "", {
          httpOnly: true,
          secure: process.env.AUTH_COOKIE_SECURE === "true",
          sameSite: "lax",
          path: "/",
          expires: new Date(0),
        });
        return redirectResponse;
      }
    }

    try {
      // Direct import — no HTTP self-fetch overhead
      const settings = await getSettings();
      // Skip auth if login is not required
      if (settings.requireLogin === false) {
        return response;
      }
      // Skip auth ONLY for fresh installs (before onboarding) where no password exists yet.
      // Once setupComplete is true, always require auth — prevents bypass if password row is lost (#151)
      if (!settings.setupComplete && !settings.password && !process.env.INITIAL_PASSWORD) {
        return response;
      }
      // Allow access to settings security tab to configure initial password
      // when setup is complete but no password exists yet
      if (
        pathname.startsWith("/dashboard/settings") &&
        !settings.password &&
        !process.env.INITIAL_PASSWORD
      ) {
        return response;
      }
    } catch (err) {
      // FASE-01: Log settings fetch errors instead of silencing them
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Middleware] settings_error: Settings read failed:", errMsg, {
        path: pathname,
        requestId,
      });
      // On error, require login
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect / to /dashboard if logged in, or /dashboard if it's the root
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return response;
}

export const config = {
  // `/owui/:path*` covers both the SPA shell and its `/owui/api/*` backend. Without it the
  // guard above never runs and the chat is public.
  matcher: ["/", "/dashboard/:path*", "/api/:path*", "/owui", "/owui/:path*"],
};
