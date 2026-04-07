#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const packageJsonPath = path.resolve(cwd, "package.json");
const openApiPath = path.resolve(cwd, "docs/openapi.yaml");
const changelogPath = path.resolve(cwd, "CHANGELOG.md");

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${path.relative(cwd, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractOpenApiVersion(content) {
  const lines = content.split(/\r?\n/);
  let inInfoBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inInfoBlock) {
      if (trimmed === "info:") {
        inInfoBlock = true;
      }
      continue;
    }

    if (line.length > 0 && !line.startsWith(" ")) {
      break;
    }

    const match = line.match(/^\s{2}version:\s*["']?([^"'\s]+)["']?\s*$/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractChangelogSections(content) {
  const headings = [
    ...content.matchAll(/^#{2,3}\s+(?:\[([^\]]+)\]|(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?))(?:.*)?$/gm),
  ];
  return headings.map((match) => match[1] || match[2]).filter(Boolean);
}

function isSemver(value) {
  // Accept X.Y.Z and X.Y.Z-prerelease.N (e.g. 3.0.0-rc.1, 3.0.0-beta.2)
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(value);
}

let hasFailure = false;

function fail(message) {
  hasFailure = true;
  console.error(`[docs-sync] FAIL - ${message}`);
}

try {
  const packageJson = JSON.parse(readText(packageJsonPath));
  const packageVersion = packageJson.version;

  if (!isSemver(packageVersion)) {
    fail(`package.json version is not valid semver: "${packageVersion}"`);
  } else {
    console.log(`[docs-sync] package.json version: ${packageVersion}`);
  }

  const openApiVersion = extractOpenApiVersion(readText(openApiPath));
  if (!openApiVersion) {
    fail("could not extract docs/openapi.yaml info.version");
  } else if (openApiVersion !== packageVersion) {
    fail(`OpenAPI version (${openApiVersion}) differs from package.json (${packageVersion})`);
  } else {
    console.log(`[docs-sync] openapi.yaml info.version matches: ${openApiVersion}`);
  }

  const changelogSections = extractChangelogSections(readText(changelogPath));
  if (changelogSections.length === 0) {
    fail("CHANGELOG.md has no version sections");
  } else {
    if (changelogSections[0] === "Unreleased") {
      console.log("[docs-sync] changelog has top Unreleased section");
    } else if (isSemver(changelogSections[0])) {
      console.log("[docs-sync] changelog uses release-first format (no Unreleased section)");
    } else {
      fail('CHANGELOG.md first section must be "## [Unreleased]" or a semver release');
    }

    const semverSections = changelogSections.filter((section) => isSemver(section));
    if (semverSections.length === 0) {
      fail("CHANGELOG.md has no semver release section");
    } else if (semverSections[0] !== packageVersion) {
      fail(
        `Latest changelog release (${semverSections[0]}) differs from package.json (${packageVersion})`
      );
    } else {
      console.log(
        `[docs-sync] latest changelog release matches package version: ${packageVersion}`
      );
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (hasFailure) {
  process.exit(1);
}

console.log("[docs-sync] PASS - documentation version sync is consistent.");
