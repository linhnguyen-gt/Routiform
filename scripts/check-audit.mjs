#!/usr/bin/env node
/**
 * Fails on any high or critical npm audit finding that is not explicitly allowlisted.
 *
 * The CI security job previously ran `npm audit ... || true`, so it could never fail — a job that
 * always passes reports nothing. Un-suppressing it outright would have blocked every merge on the
 * existing backlog, so instead the known findings are pinned in scripts/audit-allowlist.json with
 * a reason and a review date. New findings fail immediately; the pinned ones fail once the review
 * date passes, which is what stops the backlog from ageing silently.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const allowlistPath = path.resolve(cwd, "scripts/audit-allowlist.json");

if (!fs.existsSync(allowlistPath)) {
  console.error("[audit] FAIL - scripts/audit-allowlist.json not found");
  process.exit(1);
}

const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const allowedPackages = new Map(allowlist.allowed.map((entry) => [entry.package, entry.reason]));

// npm audit exits non-zero when it finds anything, so the output is read from the thrown error.
let raw;
try {
  raw = execFileSync("npm", ["audit", "--json", "--omit=dev"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  raw = err.stdout;
}

if (!raw) {
  console.error("[audit] FAIL - npm audit produced no output");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("[audit] FAIL - could not parse npm audit output");
  process.exit(1);
}

const severe = Object.entries(report.vulnerabilities ?? {}).filter(([, v]) =>
  ["high", "critical"].includes(v.severity)
);

const unlisted = severe.filter(([name]) => !allowedPackages.has(name));

let failed = false;

if (unlisted.length > 0) {
  failed = true;
  console.error("[audit] FAIL - high/critical findings that are not allowlisted:");
  for (const [name, v] of unlisted) {
    console.error(`  ${name} (${v.severity}) — ${v.via?.[0]?.url ?? "see npm audit"}`);
  }
  console.error(
    "\nFix it, or add it to scripts/audit-allowlist.json with a reason and keep the review date honest."
  );
}

const reviewBy = Date.parse(allowlist.reviewBy);
if (Number.isNaN(reviewBy)) {
  failed = true;
  console.error(`[audit] FAIL - allowlist reviewBy is not a date: ${allowlist.reviewBy}`);
} else if (Date.now() > reviewBy) {
  failed = true;
  console.error(
    `[audit] FAIL - the allowlist review date (${allowlist.reviewBy}) has passed. ` +
      "Re-triage the pinned findings and move the date, or remove the entries that are now fixable."
  );
}

// An allowlist entry for something that no longer appears is stale and should go.
const stale = [...allowedPackages.keys()].filter(
  (name) => !severe.some(([found]) => found === name)
);
if (stale.length > 0) {
  console.warn(
    `[audit] note - allowlist entries no longer reported, safe to remove: ${stale.join(", ")}`
  );
}

if (failed) process.exit(1);

console.log(
  `[audit] PASS - ${severe.length} high/critical findings, all allowlisted; review due ${allowlist.reviewBy}.`
);
