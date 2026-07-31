#!/usr/bin/env node
/**
 * Asserts every rewrite source in next.config.mjs is covered by src/proxy.ts's middleware matcher.
 *
 * Next runs middleware before beforeFiles rewrites, so middleware sees the ORIGINAL path. A
 * rewrite from /chat/completions to /api/v1/chat/completions therefore does not inherit the
 * /api/:path* matcher entry — the request reaches the route handler having passed no middleware at
 * all. That is how the drain guard and the body-size guard came to miss the gateway's primary
 * traffic without anyone noticing.
 *
 * Extending the matcher fixes today. This gate is what stops the next added rewrite from silently
 * re-opening the gap.
 */

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const nextConfigPath = path.resolve(cwd, "next.config.mjs");
const proxyPath = path.resolve(cwd, "src/proxy.ts");

for (const file of [nextConfigPath, proxyPath]) {
  if (!fs.existsSync(file)) {
    console.error(`[middleware-matcher] FAIL - file not found: ${path.relative(cwd, file)}`);
    process.exit(1);
  }
}

const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
const proxySource = fs.readFileSync(proxyPath, "utf8");

/** Rewrite sources, excluding the socket.io and Open WebUI SPA passthroughs. */
const sources = [...nextConfig.matchAll(/source:\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((source) => !source.startsWith("/owui"));

const matcherBlock = proxySource.match(/matcher:\s*\[([\s\S]*?)\]/);
if (!matcherBlock) {
  console.error("[middleware-matcher] FAIL - could not find the matcher array in src/proxy.ts");
  process.exit(1);
}
const patterns = [...matcherBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** Translate a Next matcher pattern into a regex. `:path*` spans segments; `:name` spans one. */
function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z_]\w*\*/g, "SEGMENTS")
    .replace(/:[A-Za-z_]\w*/g, "SEGMENT")
    .replace(/SEGMENTS/g, ".*")
    .replace(/SEGMENT/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

const matcherRegexes = patterns.map(patternToRegex);

/** A concrete path a client would actually send for this rewrite source. */
function sampleFor(source) {
  return source.replace(/:[A-Za-z_]\w*\*/g, "sample/path").replace(/:[A-Za-z_]\w*/g, "sample");
}

const uncovered = [];
for (const source of sources) {
  const sample = sampleFor(source);
  if (!matcherRegexes.some((re) => re.test(sample))) {
    uncovered.push({ source, sample });
  }
}

if (uncovered.length > 0) {
  console.error("[middleware-matcher] FAIL - rewrite sources not covered by the proxy matcher:");
  for (const { source, sample } of uncovered) {
    console.error(`  ${source}  (e.g. ${sample})`);
  }
  console.error(
    "\nAdd each path to the matcher in src/proxy.ts. Without it the request bypasses the drain\n" +
      "guard, the body-size guard and IP filtering entirely."
  );
  process.exit(1);
}

console.log(
  `[middleware-matcher] OK - all ${sources.length} rewrite sources are covered by the proxy matcher.`
);
