import { isIP } from "node:net";

/**
 * T07: Extract the real client IP from X-Forwarded-For header.
 * Skips invalid entries like "unknown" or empty strings.
 * Falls back to remoteAddress if no valid IP found.
 * Ref: sub2api PR #1135
 *
 * @param xForwardedFor - Value of the X-Forwarded-For header (may be CSV)
 * @param remoteAddress - Fallback from the raw socket (req.socket.remoteAddress)
 * @returns The first valid IP address found, or "unknown"
 */
export function extractClientIp(
  xForwardedFor: string | null | undefined,
  remoteAddress: string | undefined
): string {
  if (xForwardedFor) {
    const entries = xForwardedFor.split(",");
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (trimmed && isIP(trimmed) !== 0) {
        return trimmed; // First valid IP wins
      }
    }
  }
  return remoteAddress?.trim() ?? "unknown";
}

/**
 * Peers whose forwarding headers may be believed, as a comma-separated list of IPs.
 *
 * Empty by default: forwarding headers are attacker-controlled unless a proxy you operate set
 * them. Any client can send `X-Forwarded-For: 8.8.8.8`, so trusting the header unconditionally
 * makes IP-based decisions — filtering, rate limiting, audit trails — trivially defeated.
 */
export const TRUSTED_PROXY_ENV = "TRUSTED_PROXY_IPS";

function trustedProxies(): Set<string> {
  const raw = process.env[TRUSTED_PROXY_ENV] ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

/**
 * Whether this request arrived from a peer allowed to speak for another address.
 *
 * A request with no derivable peer (Next middleware carries no socket) is never trusted: the
 * alternative is believing headers on exactly the path where we cannot verify their origin.
 */
export function isTrustedProxyPeer(peerAddress: string | undefined): boolean {
  const trusted = trustedProxies();
  if (trusted.size === 0) return false;
  const peer = peerAddress?.trim();
  if (!peer) return false;
  return trusted.has(peer);
}

/**
 * Extract client IP from a Request or NextRequest object.
 *
 * Forwarding headers are consulted only when the immediate peer is in TRUSTED_PROXY_IPS.
 * Otherwise the socket address is the answer, and "unknown" when there is none — callers must
 * treat "unknown" as an address they cannot verify, not as one that matches nothing.
 */
export function getClientIpFromRequest(req: {
  headers?: Headers | { get?: (n: string) => string | null };
  socket?: { remoteAddress?: string };
  ip?: string;
}): string {
  const peerAddress = req.ip ?? req.socket?.remoteAddress;
  if (!isTrustedProxyPeer(peerAddress)) {
    return extractClientIp(null, peerAddress);
  }
  // Helper to get header value from either Headers object or plain object
  const getHeader = (name: string): string | null => {
    if (!req.headers) return null;
    if (typeof (req.headers as Headers).get === "function") {
      return (req.headers as Headers).get(name);
    }
    return null;
  };

  // Priority: CF-Connecting-IP (Cloudflare) > X-Forwarded-For > X-Real-IP > socket
  const cfIp = getHeader("cf-connecting-ip");
  if (cfIp && isIP(cfIp.trim()) !== 0) return cfIp.trim();

  const xff = getHeader("x-forwarded-for");
  if (xff) {
    const fromXff = extractClientIp(xff, undefined);
    if (fromXff !== "unknown") {
      return fromXff;
    }
  }

  const realIp = getHeader("x-real-ip");
  if (realIp) {
    const fromRealIp = extractClientIp(realIp, undefined);
    if (fromRealIp !== "unknown") {
      return fromRealIp;
    }
  }

  return extractClientIp(null, peerAddress);
}
