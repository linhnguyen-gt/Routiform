import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getOllamaUsageCookie,
  parseOllamaSettingsHtml,
} from "../../open-sse/services/usage/ollama-cloud-usage.ts";

const FIXTURE = `<!doctype html><html><body>
<div id="header-email">linh@example.com</div>
<section><span>Cloud Usage</span><span>Pro</span>
  <div class="usage-card">
    <span>Session usage</span>
    <div class="bar" style="width: 42.5%"></div>
    <span>42.5% used</span>
    <span>Resets in 3h</span><time data-time="2026-08-31T20:30:00.000Z"></time>
  </div>
  <div class="usage-card">
    <span>Weekly usage</span>
    <div class="bar" style="width: 12%"></div>
    <span>12% used</span>
    <span>Resets in 4d</span><time data-time="2026-09-05T00:00:00Z"></time>
  </div>
</section></body></html>`;

const SIGNIN_HTML = `<html><body><a href="/signin">Sign in</a></body></html>`;

test("parseOllamaSettingsHtml extracts session and weekly windows", () => {
  const parsed = parseOllamaSettingsHtml(FIXTURE);
  assert.ok(parsed);
  assert.equal(parsed.plan, "Pro");
  assert.equal(parsed.sessionUsedPercent, 42.5);
  assert.equal(parsed.weeklyUsedPercent, 12);
  assert.equal(parsed.sessionResetsAt, "2026-08-31T20:30:00.000Z");
  assert.equal(parsed.weeklyResetsAt, "2026-09-05T00:00:00.000Z");
});

test("parseOllamaSettingsHtml falls back to bar width when % text missing", () => {
  const html = FIXTURE.replace("42.5% used", "");
  const parsed = parseOllamaSettingsHtml(html);
  assert.ok(parsed);
  assert.equal(parsed.sessionUsedPercent, 42.5);
});

test("parseOllamaSettingsHtml returns null when signed-out page has no usage", () => {
  assert.equal(parseOllamaSettingsHtml(SIGNIN_HTML), null);
});

test("getOllamaUsageCookie normalizes bare cookie values", () => {
  assert.equal(getOllamaUsageCookie({ settingsCookie: "  " }), "");
  assert.equal(getOllamaUsageCookie({ settingsCookie: "abc123" }), "session=abc123");
  assert.equal(
    getOllamaUsageCookie({ settingsCookie: "session=tok; other=1" }),
    "session=tok; other=1"
  );
  assert.equal(getOllamaUsageCookie(undefined), "");
});

/** Response with a fixed res.url — Node's Response constructor ignores the url option. */
function mockResponse(body, { status = 200, url }) {
  const res = new Response(body, { status });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

function withRedirected(res, redirected = true) {
  Object.defineProperty(res, "redirected", { value: redirected });
  return res;
}

test("getOllamaCloudUsage reports the real status (403) on cookie rejection", async () => {
  const { getOllamaCloudUsage } =
    await import("../../open-sse/services/usage/ollama-cloud-usage.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockResponse("forbidden", { status: 403, url: "https://ollama.com/settings" });
  try {
    const usage = await getOllamaCloudUsage({ settingsCookie: "session=abc" });
    assert.match(usage.message, /HTTP 403/);
    // Auth-failure wording is matched by providerLimits to mark dead connections,
    // so a scraping failure must never use it.
    assert.doesNotMatch(usage.message, /unauthorized|token expired/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getOllamaCloudUsage reports cookie expired on sign-in redirect", async () => {
  const { getOllamaCloudUsage } =
    await import("../../open-sse/services/usage/ollama-cloud-usage.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    withRedirected(mockResponse("moved", { url: "https://ollama.com/signin" }));
  try {
    const usage = await getOllamaCloudUsage({ settingsCookie: "session=abc" });
    assert.match(usage.message, /cookie expired/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redirect without sign-in URL is NOT treated as auth failure", async () => {
  const { getOllamaCloudUsage } =
    await import("../../open-sse/services/usage/ollama-cloud-usage.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    withRedirected(mockResponse(FIXTURE, { url: "https://ollama.com/settings" }));
  try {
    const usage = await getOllamaCloudUsage({ settingsCookie: "session=abc" });
    assert.ok(usage.quotas);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
