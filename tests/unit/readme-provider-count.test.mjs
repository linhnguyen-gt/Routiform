import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The README's headline number and its language switcher are the two claims on the page a visitor
 * checks first, and both rot silently: a provider lands in the registry, a locale directory moves,
 * and nothing fails. These assert them against the repository instead.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const README = readFileSync(new URL("README.md", `file://${REPO_ROOT}`), "utf-8");

const { APIKEY_PROVIDERS } = await import("../../open-sse/config/registry-providers-apikey.ts");
const { OAUTH_PROVIDERS } = await import("../../open-sse/config/registry-providers-oauth.ts");
const { FREE_PROVIDERS } = await import("../../open-sse/config/registry-providers-free.ts");
const { LOCAL_PROVIDERS } = await import("../../open-sse/config/registry-providers-local.ts");

test("the headline provider count is the number the registry actually ships", () => {
  const counted =
    Object.keys(APIKEY_PROVIDERS).length +
    Object.keys(OAUTH_PROVIDERS).length +
    Object.keys(FREE_PROVIDERS).length +
    Object.keys(LOCAL_PROVIDERS).length;

  const claimed = README.match(/\*\*(\d+) providers ship in the registry today\*\*/);
  assert.ok(claimed, "the README lede must state the provider count");
  assert.equal(
    Number(claimed[1]),
    counted,
    `README says ${claimed[1]} providers, the registry ships ${counted} — update both, or neither`
  );
});

test("the footnote breakdown adds up to the same number", () => {
  const footnote = README.match(
    /\[\^count\]:.*?(\d+) API-key, (\d+) OAuth, (\d+) free-tier, (\d+) local/s
  );
  assert.ok(footnote, "the count must cite how it was obtained");
  const [apikey, oauth, free, local] = footnote.slice(1, 5).map(Number);
  assert.equal(apikey, Object.keys(APIKEY_PROVIDERS).length);
  assert.equal(oauth, Object.keys(OAUTH_PROVIDERS).length);
  assert.equal(free, Object.keys(FREE_PROVIDERS).length);
  assert.equal(local, Object.keys(LOCAL_PROVIDERS).length);
});

test("every language-switcher link resolves to a file that exists", () => {
  const switcher = README.split("\n").find((line) => line.startsWith("🌐 **Languages:**"));
  assert.ok(
    switcher,
    "the root README must carry the language switcher — the translations were undiscoverable without it"
  );

  const targets = [...switcher.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(
    targets.length >= 32,
    `expected at least 32 translated READMEs, found ${targets.length}`
  );

  for (const target of targets) {
    assert.ok(
      existsSync(new URL(target, `file://${REPO_ROOT}`)),
      `${target} is linked from the root README but does not exist`
    );
  }
});

test("each translated README says which English revision it was translated from", () => {
  // The translations are deliberately frozen at a revision rather than re-synced on every English
  // edit. That is only honest if each file dates itself and points at the current English README.
  const targets = [...README.matchAll(/\]\((docs\/i18n\/[^)]+\/README\.md)\)/g)].map((m) => m[1]);
  assert.equal(targets.length, 32);

  for (const target of targets) {
    const body = readFileSync(new URL(target, `file://${REPO_ROOT}`), "utf-8");
    assert.match(
      body,
      /> _Translated from \[Routiform v[\d.]+\]\(.*?\), \d{4}-\d{2}-\d{2}\./,
      `${target} must carry a dated "translated from" note`
    );
  }
});
