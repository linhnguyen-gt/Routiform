#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * This repository contains a legacy `app/` snapshot (packaging/runtime artifacts)
 * alongside the active Next.js source in `src/app/`. Next.js route discovery scans
 * both and fails the build on legacy files. We temporarily move the legacy folder
 * out of the project root during `next build`, then restore it in all outcomes.
 */

const projectRoot = process.cwd();
const legacyAppDir = path.join(projectRoot, "app");
const backupDir = path.join(projectRoot, `.app-build-backup-${process.pid}-${Date.now()}`);

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function movePath(sourcePath, destinationPath) {
  try {
    await fs.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
  }

  await fs.cp(sourcePath, destinationPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
  });
  await fs.rm(sourcePath, { recursive: true, force: true });
}

function runNextBuild() {
  return new Promise((resolve) => {
    const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
    const child = spawn(process.execPath, [nextBin, "build"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });

    const forward = (signal) => {
      if (!child.killed) child.kill(signal);
    };

    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);

    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (signal) {
        resolve({ code: 1, signal });
        return;
      }
      resolve({ code: code ?? 1, signal: null });
    });
  });
}

async function main() {
  let moved = false;

  try {
    if (await exists(legacyAppDir)) {
      await movePath(legacyAppDir, backupDir);
      moved = true;
    }

    const result = await runNextBuild();
    process.exitCode = result.code;
  } catch (error) {
    console.error("[build-next-isolated] Build failed:", error);
    process.exitCode = 1;
  } finally {
    if (moved) {
      try {
        await movePath(backupDir, legacyAppDir);
      } catch (restoreError) {
        console.error(
          `[build-next-isolated] Failed to restore legacy app dir from ${backupDir}:`,
          restoreError
        );
        process.exitCode = 1;
      }
    }
  }
}

await main();
