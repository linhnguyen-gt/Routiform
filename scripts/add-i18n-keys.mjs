#!/usr/bin/env node
/**
 * One-shot i18n key insertion helper.
 *
 * Inserts English placeholder values for keys that are missing from a namespace
 * in every locale file, preserving each file's existing key ordering, 2-space
 * indentation and trailing newline. Idempotent in both modes.
 *
 * Usage:
 *   node scripts/add-i18n-keys.mjs <namespace> <keys.json> [--overwrite] [--dry-run]
 *
 * <keys.json> is a file containing a flat `{ "key": "English value" }` object.
 * Without --overwrite, existing keys are left untouched and only absent keys are
 * appended at the end of the namespace object. With --overwrite, every listed
 * key is replaced — use it only for a small, explicitly chosen key set.
 */

import fs from "node:fs";
import path from "node:path";

const MESSAGES_DIR = path.join(process.cwd(), "src/i18n/messages");

function fail(message) {
  console.error(`[add-i18n-keys] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => !arg.startsWith("--"));

if (positional.length !== 2) {
  fail("usage: add-i18n-keys.mjs <namespace> <keys.json> [--overwrite] [--dry-run]");
}

const [namespace, keysFile] = positional;

let keys;
try {
  keys = JSON.parse(fs.readFileSync(keysFile, "utf8"));
} catch (error) {
  fail(`cannot read key map '${keysFile}': ${error.message}`);
}

if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
  fail("key map must be a flat JSON object");
}

const locales = fs
  .readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort();

let changedFiles = 0;
const previousValues = {};

for (const file of locales) {
  const filePath = path.join(MESSAGES_DIR, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  if (!data[namespace] || typeof data[namespace] !== "object") {
    fail(`${file}: namespace '${namespace}' is missing or not an object`);
  }

  const target = data[namespace];
  const applied = [];

  for (const [key, value] of Object.entries(keys)) {
    const exists = key in target;
    if (exists && !overwrite) continue;
    if (exists && target[key] === value) continue;

    if (exists) {
      previousValues[file] ??= {};
      previousValues[file][key] = target[key];
    }
    target[key] = value;
    applied.push(key);
  }

  if (applied.length === 0) continue;

  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  const next = `${JSON.stringify(data, null, 2)}${trailingNewline}`;
  if (next === raw) continue;

  if (!dryRun) fs.writeFileSync(filePath, next);
  changedFiles += 1;
  console.log(`${file}: ${applied.join(", ")}`);
}

if (overwrite && Object.keys(previousValues).length > 0) {
  console.log("\nOverwritten previous values (record these for translators):");
  for (const [file, entries] of Object.entries(previousValues)) {
    for (const [key, value] of Object.entries(entries)) {
      console.log(`  ${file} ${key}: ${JSON.stringify(value)}`);
    }
  }
}

console.log(`\n${dryRun ? "[dry run] " : ""}${changedFiles}/${locales.length} files changed`);
