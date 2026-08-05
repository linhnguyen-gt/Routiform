import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * `safeOutboundFetch` blocks loopback and private targets, which is why an operator could chat
 * against a local Ollama (that path uses plain `fetch`) but could not list its models or validate
 * the connection. Two operator-config call sites now opt in.
 *
 * The opt-in is an SSRF surface if it spreads: a caller who can point a base URL at
 * `http://127.0.0.1:8080/admin` can read the response through the model-listing endpoint. Two
 * things keep that closed — the write path is session-only, and the opt-in is passed explicitly at
 * exactly two call sites. The second is what this file guards.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const { assertSafeOutboundUrl } = await import("../../src/lib/network/safeOutboundFetch.ts");

const OPT_IN = { allowLoopback: true, allowPrivateAddress: true };

test("the default posture still blocks loopback — this is the regression guard", () => {
  for (const url of [
    "http://localhost:11434/v1/models",
    "http://127.0.0.1:11434/v1/models",
    "http://[::1]:11434/v1/models",
  ]) {
    assert.throws(
      () => assertSafeOutboundUrl(url),
      (err) => err.code === "private_address_blocked",
      `${url} must stay blocked for a caller that does not opt in`
    );
  }
});

test("the default posture still blocks private addresses", () => {
  for (const url of ["http://192.168.1.50:11434/v1/models", "http://10.0.0.5/v1/models"]) {
    assert.throws(
      () => assertSafeOutboundUrl(url),
      (err) => err.code === "private_address_blocked"
    );
  }
});

test("the opt-in resolves a loopback URL", () => {
  for (const url of ["http://localhost:11434/v1/models", "http://127.0.0.1:11434/v1/models"]) {
    const resolved = assertSafeOutboundUrl(url, OPT_IN);
    assert.equal(resolved.toString(), url);
  }
});

test("the opt-in resolves a private-LAN URL, for an Ollama on another machine", () => {
  const resolved = assertSafeOutboundUrl("http://192.168.1.50:11434/v1/models", OPT_IN);
  assert.equal(resolved.hostname, "192.168.1.50");
});

test("a credentialed URL is rejected even on the opted-in path", () => {
  assert.throws(
    () => assertSafeOutboundUrl("http://user:pass@127.0.0.1:11434/v1/models", OPT_IN),
    (err) => err.code === "credentialed_url",
    "opting into loopback must not opt out of the credential rule"
  );
});

test("a non-http protocol is rejected even on the opted-in path", () => {
  assert.throws(
    () => assertSafeOutboundUrl("file:///etc/passwd", OPT_IN),
    (err) => err.code === "unsupported_protocol"
  );
});

test("the opt-in is passed at exactly two call sites, both operator config", () => {
  // Grep-as-a-test, deliberately: the safety property is that a reviewer can count the call sites.
  // A helper that hides the option, or a module-level default, would defeat it — and would not
  // show up in this count either, which is why the file list is asserted, not just the number.
  const CALL_SITES = [
    "src/app/api/providers/[id]/models/handle-openai-compatible-models.ts",
    "src/lib/providers/validation/openai-like.ts",
  ];

  for (const relative of CALL_SITES) {
    const source = readFileSync(new URL(relative, `file://${REPO_ROOT}`), "utf-8");
    assert.match(
      source,
      /allowLoopback:\s*true/,
      `${relative} is meant to carry the loopback opt-in`
    );
  }
});

test("the write path that sets a base URL requires a dashboard session", () => {
  // The opt-in is only defensible because a gateway API key cannot create or edit the node whose
  // base URL it later fetches.
  for (const relative of [
    "src/app/api/provider-nodes/route.ts",
    "src/app/api/provider-nodes/[id]/route.ts",
  ]) {
    const source = readFileSync(new URL(relative, `file://${REPO_ROOT}`), "utf-8");
    const writes = [...source.matchAll(/export async function (POST|PUT|DELETE)\b/g)].length;
    const guards = source.split("isHostSecretAuthenticated(").length - 1;
    assert.ok(writes > 0, `${relative} should declare at least one write handler`);
    assert.ok(
      guards >= writes,
      `${relative}: ${writes} write handler(s) but only ${guards} host-secret guard(s)`
    );
  }
});
