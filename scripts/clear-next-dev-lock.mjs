#!/usr/bin/env node
/**
 * Removes `.next/dev/lock` when no process is listening on the dashboard port.
 * Use when `next dev` fails with "Unable to acquire lock" after a crash or kill -9.
 */
import { existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapEnv } from "./bootstrap-env.mjs";
import { resolveRuntimePorts } from "./runtime-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.join(__dirname, "..", ".next", "dev", "lock");

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code;
      resolve(code !== "EADDRINUSE");
    });
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

const env = bootstrapEnv({ quiet: true });
const { dashboardPort } = resolveRuntimePorts(env);

const available = await isPortAvailable(dashboardPort);
if (!available) {
  console.error(
    `[dev:unlock] Port ${dashboardPort} is in use — stop the running dev server first, then retry.`
  );
  process.exit(1);
}

if (existsSync(lockPath)) {
  unlinkSync(lockPath);
  console.log(`[dev:unlock] Removed stale lock: ${lockPath}`);
} else {
  console.log(`[dev:unlock] No lock file (ok): ${lockPath}`);
}
