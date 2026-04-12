import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const postinstallPath = path.join(process.cwd(), "scripts", "postinstall.mjs");
const source = fs.readFileSync(postinstallPath, "utf8");

test("postinstall uses build-from-source fallback on Android", () => {
  assert.match(source, /const isAndroid = process\.platform === "android";/);
  assert.match(source, /npm rebuild better-sqlite3 --build-from-source/);
});

test("postinstall increases Android rebuild timeout to 300 seconds", () => {
  assert.match(source, /const rebuildTimeout = isAndroid \? 300_000 : 120_000;/);
});
