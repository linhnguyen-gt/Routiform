import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { updateRequireLoginSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getJwtSecret } from "@/shared/utils/jwtSecret";
import { hasValidSessionToken } from "@/shared/utils/apiAuth";

export async function GET() {
  try {
    const settings = await getSettings();
    const requireLogin = settings.requireLogin !== false;
    const hasPassword = !!settings.password || !!process.env.INITIAL_PASSWORD;
    const setupComplete = !!settings.setupComplete;
    return NextResponse.json({ requireLogin, hasPassword, setupComplete });
  } catch (error) {
    console.error("[API] Error fetching require-login settings:", error);
    return NextResponse.json(
      { requireLogin: true, hasPassword: true, setupComplete: true },
      { status: 200 }
    );
  }
}

/**
 * POST /api/settings/require-login — Set password and/or toggle requireLogin.
 * Used by the onboarding wizard security step.
 */
export async function POST(request: Request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const validation = validateBody(updateRequireLoginSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;
    const { requireLogin, password } = body;

    // This endpoint is public because first-run onboarding needs it before any session
    // exists. Once a credential exists — a stored hash OR an INITIAL_PASSWORD env login —
    // it stops being a bootstrap surface: an unauthenticated caller could otherwise
    // overwrite the operator's password (or flip requireLogin off) and take over the
    // instance. Dashboard-session cookie only: gateway Bearer API keys are handed to
    // inference clients and must not rotate the operator's password.
    const settings = await getSettings();
    const hadCredential =
      (typeof settings.password === "string" && settings.password.length > 0) ||
      !!process.env.INITIAL_PASSWORD;
    if (hadCredential && !(await hasValidSessionToken(request))) {
      return NextResponse.json(
        { error: { message: "Password already configured. Sign in to change it." } },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (typeof requireLogin === "boolean") {
      updates.requireLogin = requireLogin;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      // bcrypt costs hundreds of ms; a concurrent first-set could have landed a hash in the
      // meantime. Re-check before writing so the loser of the race cannot overwrite the
      // winner's credential (last-write-wins would hand both callers a session).
      const fresh = await getSettings();
      const freshHash = typeof fresh.password === "string" ? fresh.password.length > 0 : false;
      if (freshHash && !hadCredential && !(await hasValidSessionToken(request))) {
        return NextResponse.json(
          { error: { message: "Password already configured. Sign in to change it." } },
          { status: 403 }
        );
      }
      updates.password = hashedPassword;
    }

    await updateSettings(updates);

    const response = NextResponse.json({ success: true });

    // First-time password creation doubles as login: onboarding steps after this one call
    // authenticated endpoints (PATCH /api/settings for setupComplete), which previously
    // 401'd and silently left setupComplete unset, trapping the user in the wizard.
    if (password && !hadCredential) {
      const secret = getJwtSecret();
      if (!secret) {
        return NextResponse.json(
          { error: "Server misconfigured: JWT_SECRET not set." },
          { status: 500 }
        );
      }
      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(secret);
      const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
      const forwardedProto = (request.headers.get("x-forwarded-proto") || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
      const useSecureCookie =
        forceSecureCookie ||
        forwardedProto === "https" ||
        new URL(request.url).protocol === "https:";
      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: useSecureCookie,
        sameSite: "lax",
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("[API] Error updating require-login settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}
