import test from "node:test";
import assert from "node:assert/strict";

import {
  extractClientIp,
  getClientIpFromRequest,
  TRUSTED_PROXY_ENV,
} from "../../src/lib/ipUtils.ts";

// Header precedence is still cf-connecting-ip > x-forwarded-for > x-real-ip, but it now applies
// only when the immediate peer is a configured proxy. These tests previously asserted the
// precedence with no peer at all, which is exactly the spoofable case.

const TRUSTED_PEER = "192.0.2.1";

function withTrustedPeer(fn) {
  const original = process.env[TRUSTED_PROXY_ENV];
  process.env[TRUSTED_PROXY_ENV] = TRUSTED_PEER;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env[TRUSTED_PROXY_ENV];
    else process.env[TRUSTED_PROXY_ENV] = original;
  }
}

test("extractClientIp returns first valid IP from x-forwarded-for", () => {
  const result = extractClientIp("unknown, 10.0.0.1, 203.0.113.5", undefined);
  assert.equal(result, "10.0.0.1");
});

test("getClientIpFromRequest falls back to x-real-ip when x-forwarded-for is invalid", () => {
  const headers = new Headers({
    "x-forwarded-for": "unknown,not-an-ip",
    "x-real-ip": "203.0.113.7",
  });

  const result = withTrustedPeer(() =>
    getClientIpFromRequest({ headers, socket: { remoteAddress: TRUSTED_PEER } })
  );
  assert.equal(result, "203.0.113.7");
});

test("getClientIpFromRequest prefers cf-connecting-ip", () => {
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.10",
    "x-forwarded-for": "203.0.113.8",
    "x-real-ip": "203.0.113.9",
  });

  const result = withTrustedPeer(() =>
    getClientIpFromRequest({ headers, socket: { remoteAddress: TRUSTED_PEER } })
  );
  assert.equal(result, "198.51.100.10");
});

test("the same headers from an untrusted peer resolve to the socket address", () => {
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.10",
    "x-forwarded-for": "203.0.113.8",
  });

  const result = getClientIpFromRequest({ headers, socket: { remoteAddress: "203.0.113.99" } });
  assert.equal(result, "203.0.113.99");
});
