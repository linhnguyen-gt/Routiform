import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { loginSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getJwtSecret } from "@/shared/utils/jwtSecret";
import { createHash, timingSafeEqual } from "node:crypto";
import { checkLockout, recordFailedAttempt, recordSuccess } from "@/domain/lockoutPolicy";
import { getClientIpFromRequest } from "@/lib/ipUtils";

/**
 * Per-account lockout is the primary control: it is what actually bounds guessing against the
 * one dashboard password. Per-IP is secondary with a higher threshold, so a shared egress
 * address (CGNAT, an office NAT) does not lock a legitimate operator out on someone else's
 * behalf. Both surface in the logs so a lockout is diagnosable rather than mysterious.
 */
const ACCOUNT_IDENTIFIER = "login:account:dashboard";
const ACCOUNT_LOCKOUT = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  attemptWindowMs: 5 * 60 * 1000,
};
const IP_LOCKOUT = {
  maxAttempts: 20,
  lockoutDurationMs: 15 * 60 * 1000,
  attemptWindowMs: 5 * 60 * 1000,
};
const LOCKOUT_CONFIGS: Record<string, typeof ACCOUNT_LOCKOUT> = {
  [ACCOUNT_IDENTIFIER]: ACCOUNT_LOCKOUT,
};

/**
 * Compare two secrets without leaking their relationship through timing.
 *
 * Both sides are hashed first so the comparison is over fixed-width buffers: timingSafeEqual
 * throws on length mismatch, which would otherwise leak the expected password's length.
 */
function timingSafeCompare(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function POST(request) {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfigured: JWT_SECRET not set. Contact administrator." },
        { status: 500 }
      );
    }

    const rawBody = await request.json();

    // Zod validation
    const validation = validateBody(loginSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const password = typeof validation.data.password === "string" ? validation.data.password : "";
    if (!password) {
      return NextResponse.json({ error: "Invalid password payload" }, { status: 400 });
    }
    // Throttle before touching the password. /api/auth/login is a public route with no rate
    // limiting of any kind, minting a 30-day session — line-rate guessing was unbounded, and a
    // timing-safe comparison buys nothing against it.
    const clientIp = getClientIpFromRequest(request);
    const ipIdentifier = `login:ip:${clientIp}`;
    for (const identifier of [ipIdentifier, ACCOUNT_IDENTIFIER]) {
      const lockout = checkLockout(identifier, LOCKOUT_CONFIGS[identifier] ?? IP_LOCKOUT);
      if (lockout.locked) {
        const retryAfterSeconds = Math.ceil((lockout.remainingMs ?? 0) / 1000);
        console.warn(`[AUTH] login blocked: ${identifier} locked for ${retryAfterSeconds}s`);
        return NextResponse.json(
          { error: "Too many failed attempts. Try again later." },
          { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
        );
      }
    }

    const settings = await getSettings();

    const storedHash = typeof settings.password === "string" ? settings.password : "";

    let isValid = false;
    if (storedHash) {
      isValid = await bcrypt.compare(password, storedHash);
    } else {
      // SECURITY: No default password — must be set via env or onboarding
      if (!process.env.INITIAL_PASSWORD) {
        return NextResponse.json(
          { error: "No password configured. Complete onboarding first.", needsSetup: true },
          { status: 403 }
        );
      }
      isValid = timingSafeCompare(password, process.env.INITIAL_PASSWORD);
    }

    if (isValid) {
      recordSuccess(ipIdentifier);
      recordSuccess(ACCOUNT_IDENTIFIER);

      const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
      const forwardedProtoHeader = request.headers.get("x-forwarded-proto") || "";
      const forwardedProto = forwardedProtoHeader.split(",")[0].trim().toLowerCase();
      const isHttpsRequest = forwardedProto === "https" || request.nextUrl?.protocol === "https:";
      const useSecureCookie = forceSecureCookie || isHttpsRequest;

      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(secret);

      const cookieStore = await cookies();
      cookieStore.set("auth_token", token, {
        httpOnly: true,
        secure: useSecureCookie,
        sameSite: "lax",
        path: "/",
      });

      return NextResponse.json({ success: true });
    }

    // A failed attempt was previously neither counted nor logged, so there was no signal that
    // anyone was guessing at all.
    const ipState = recordFailedAttempt(ipIdentifier, IP_LOCKOUT);
    const accountState = recordFailedAttempt(ACCOUNT_IDENTIFIER, ACCOUNT_LOCKOUT);
    console.warn(
      `[AUTH] failed login from ${clientIp}` +
        (accountState.locked ? " — account now locked" : "") +
        (ipState.locked ? " — ip now locked" : "")
    );

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    console.error("[AUTH] Login failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
