import test from "node:test";
import assert from "node:assert/strict";

// Forwarding headers are attacker-controlled unless a proxy you operate set them. Believing them
// unconditionally made every IP-based decision — filtering, rate limiting, audit trails —
// defeatable with one header.

const { getClientIpFromRequest, isTrustedProxyPeer, TRUSTED_PROXY_ENV } =
  await import("../../src/lib/ipUtils.ts");

const ORIGINAL = process.env[TRUSTED_PROXY_ENV];

function withTrusted(value, fn) {
  if (value === undefined) delete process.env[TRUSTED_PROXY_ENV];
  else process.env[TRUSTED_PROXY_ENV] = value;
  try {
    return fn();
  } finally {
    if (ORIGINAL === undefined) delete process.env[TRUSTED_PROXY_ENV];
    else process.env[TRUSTED_PROXY_ENV] = ORIGINAL;
  }
}

function request(headers, remoteAddress) {
  return { headers: new Headers(headers), socket: { remoteAddress } };
}

test("a spoofed x-forwarded-for from an untrusted peer is ignored", () => {
  withTrusted(undefined, () => {
    const ip = getClientIpFromRequest(request({ "x-forwarded-for": "8.8.8.8" }, "203.0.113.9"));
    assert.equal(ip, "203.0.113.9", "the socket peer is the only verifiable address");
  });
});

test("a spoofed cf-connecting-ip from an untrusted peer is ignored", () => {
  withTrusted(undefined, () => {
    const ip = getClientIpFromRequest(request({ "cf-connecting-ip": "8.8.8.8" }, "203.0.113.9"));
    assert.equal(ip, "203.0.113.9");
  });
});

test("a forwarding header is honoured when the peer is a configured proxy", () => {
  withTrusted("203.0.113.9", () => {
    const ip = getClientIpFromRequest(request({ "x-forwarded-for": "8.8.8.8" }, "203.0.113.9"));
    assert.equal(ip, "8.8.8.8");
  });
});

test("a peer not in the trust list is not believed even when others are", () => {
  withTrusted("10.0.0.1", () => {
    const ip = getClientIpFromRequest(request({ "x-forwarded-for": "8.8.8.8" }, "203.0.113.9"));
    assert.equal(ip, "203.0.113.9");
  });
});

test("a request with no derivable peer is never trusted", () => {
  withTrusted("203.0.113.9", () => {
    // Next middleware requests carry no socket. Believing headers there would trust exactly the
    // path where the origin cannot be verified.
    assert.equal(isTrustedProxyPeer(undefined), false);
    const ip = getClientIpFromRequest({ headers: new Headers({ "x-forwarded-for": "8.8.8.8" }) });
    assert.equal(ip, "unknown");
  });
});

test("an empty trust list trusts nothing", () => {
  withTrusted("", () => {
    assert.equal(isTrustedProxyPeer("203.0.113.9"), false);
  });
});
