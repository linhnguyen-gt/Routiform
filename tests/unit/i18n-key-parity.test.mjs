/**
 * i18n key parity across every locale.
 *
 * Nothing like this existed. The only prior i18n test asserts 12 hardcoded
 * `settings.*` keys against 2 of the 32 locales, and scripts/check_translations.py
 * validates code -> en.json only — so ORPHANED keys (present in a locale, absent
 * from en.json) were undetectable by construction.
 *
 * Phase 04 of the native-chat plan removes the `chatLauncher` namespace from 24
 * keys x 32 locales. This test is what verifies that sweep left no stragglers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, "../../src/i18n/messages");

/**
 * Namespaces allowed to exist in en.json but not yet in other locales.
 *
 * Add a namespace here ONLY as a deliberate, temporary decision — a new feature
 * shipping English-first. Removing it from this list is the definition of "the
 * translation sweep is done". An empty list is the goal state.
 *
 * `chat` is the native chat UI (Phase 02), which ships English-first.
 */
const ENGLISH_ONLY_NAMESPACES = new Set(["chat"]);

/**
 * Pre-existing translation debt, measured on main at 2026-07-13.
 *
 * This repo already ships 6,373 untranslated keys across its 30 non-English
 * locales. Paying that down is not this plan's job, but letting it GROW silently
 * is how it got here. The ratchet below fails on any increase.
 *
 * Lower this number when translations land. Never raise it.
 */
const MISSING_KEY_BUDGET = 6373;

function flattenKeys(obj, prefix = "") {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of flattenKeys(value, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

function readLocale(file) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), "utf8"));
}

function topNamespace(key) {
  return key.split(".")[0];
}

const localeFiles = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const enKeys = flattenKeys(readLocale("en.json"));

test("i18n: every locale file is valid JSON and non-empty", () => {
  assert.ok(localeFiles.length > 1, "expected multiple locale files");
  for (const file of localeFiles) {
    const keys = flattenKeys(readLocale(file));
    assert.ok(keys.size > 0, `${file} has no keys`);
  }
});

test("i18n: no locale defines a key that en.json does not (no orphans)", () => {
  const orphansByLocale = {};

  for (const file of localeFiles) {
    if (file === "en.json") continue;
    const orphans = [...flattenKeys(readLocale(file))].filter((k) => !enKeys.has(k));
    if (orphans.length > 0) orphansByLocale[file] = orphans;
  }

  assert.deepEqual(
    orphansByLocale,
    {},
    `Locales define keys absent from en.json. A removed namespace must be removed ` +
      `from every locale, not just en.json:\n${JSON.stringify(orphansByLocale, null, 2)}`
  );
});

test("i18n: untranslated-key debt does not grow (ratchet)", () => {
  let missing = 0;
  const worst = [];

  for (const file of localeFiles) {
    if (file === "en.json") continue;
    const localeKeys = flattenKeys(readLocale(file));
    const localeMissing = [...enKeys].filter(
      (k) => !localeKeys.has(k) && !ENGLISH_ONLY_NAMESPACES.has(topNamespace(k))
    ).length;
    missing += localeMissing;
    worst.push([file, localeMissing]);
  }

  worst.sort((a, b) => b[1] - a[1]);

  assert.ok(
    missing <= MISSING_KEY_BUDGET,
    `Untranslated keys rose to ${missing} (budget ${MISSING_KEY_BUDGET}). ` +
      `A new user-facing string was added to en.json without translations, and it is not ` +
      `covered by ENGLISH_ONLY_NAMESPACES. Worst locales: ` +
      `${worst
        .slice(0, 3)
        .map(([f, n]) => `${f}=${n}`)
        .join(", ")}`
  );

  // Nudge the budget down when work lands, so the ratchet keeps ratcheting.
  assert.ok(
    missing >= MISSING_KEY_BUDGET - 200,
    `Untranslated keys fell to ${missing}, well under the ${MISSING_KEY_BUDGET} budget. ` +
      `Lower MISSING_KEY_BUDGET to ${missing} to lock the win in.`
  );
});
