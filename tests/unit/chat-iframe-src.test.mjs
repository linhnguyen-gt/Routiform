import test from "node:test";
import assert from "node:assert/strict";

// Mirror helpers from chat page (keep pure — no React).
function withCacheBust(url, bust) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_rf=${bust}`;
}

function statusFingerprint(s) {
  return [s.phase, s.runtime, s.dockerMode, s.url, s.reachable, s.pid, s.lastError].join("|");
}

test("cache bust only changes when bust key changes", () => {
  const base = "http://localhost:8080/?ow_v=v0.6.40";
  const a = withCacheBust(base, 0);
  const b = withCacheBust(base, 0);
  const c = withCacheBust(base, 1);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.includes("_rf=0"));
  assert.ok(c.includes("_rf=1"));
});

test("withCacheBust uses ? when url has no query", () => {
  assert.equal(withCacheBust("http://localhost:8080/", 2), "http://localhost:8080/?_rf=2");
});

test("status fingerprint stable for identical payloads", () => {
  const s = {
    phase: "running",
    runtime: "uvx",
    dockerMode: false,
    url: "http://localhost:8080/",
    reachable: true,
    pid: 123,
    lastError: null,
  };
  assert.equal(statusFingerprint(s), statusFingerprint({ ...s }));
  assert.notEqual(statusFingerprint(s), statusFingerprint({ ...s, pid: 456 }));
});
