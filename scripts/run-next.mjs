#!/usr/bin/env node

import net from "node:net";
import { pathToFileURL } from "node:url";
import {
  resolveRuntimePorts,
  withRuntimePortEnv,
  spawnWithForwardedSignals,
} from "./runtime-env.mjs";
import { bootstrapEnv } from "./bootstrap-env.mjs";

const mode = process.argv[2] === "start" ? "start" : "dev";

function isExplicit(value) {
  return value !== undefined && value !== "";
}

function canListenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.on("error", (error) => {
      server.close();
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });

    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let candidate = startPort; candidate < startPort + attempts; candidate += 1) {
    if (await canListenOnPort(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to find a free port in range ${startPort}-${startPort + attempts - 1}`);
}

async function main() {
  // Load .env / server.env first so PORT / DASHBOARD_PORT from files affect --port below.
  const env = bootstrapEnv();
  const runtimePorts = resolveRuntimePorts(env);
  const adjustedRuntimePorts = { ...runtimePorts };
  const dashboardPortExplicit = isExplicit(env.DASHBOARD_PORT);
  const apiPortExplicit = isExplicit(env.API_PORT);
  const basePortExplicit = isExplicit(env.PORT);

  if (mode === "dev") {
    const requestedPort = runtimePorts.dashboardPort;
    const resolvedPort = await findAvailablePort(requestedPort);

    if (resolvedPort !== requestedPort) {
      adjustedRuntimePorts.dashboardPort = resolvedPort;

      if (!apiPortExplicit && runtimePorts.apiPort === requestedPort) {
        adjustedRuntimePorts.apiPort = resolvedPort;
      }

      if (!basePortExplicit && !dashboardPortExplicit && runtimePorts.basePort === requestedPort) {
        adjustedRuntimePorts.basePort = resolvedPort;
      }

      console.warn(
        `[dev] Port ${requestedPort} is already in use, falling back to ${resolvedPort}.`
      );
    }
  }

  const { dashboardPort } = adjustedRuntimePorts;
  const args = ["./node_modules/next/dist/bin/next", mode, "--port", String(dashboardPort)];

  // Default dev: Turbopack (Tailwind CSS v4 + `@import "tailwindcss"` requires PostCSS; webpack dev
  // can fail to apply postcss.config.mjs in some setups). Set ROUTIFORM_USE_WEBPACK=1 to force
  // `--webpack` if you need the legacy bundler.
  // Must read merged `env` from bootstrap — .env is not applied to process.env in the launcher.
  if (mode === "dev" && env.ROUTIFORM_USE_WEBPACK === "1") {
    args.splice(2, 0, "--webpack");
  }

  spawnWithForwardedSignals(process.execPath, args, {
    stdio: "inherit",
    env: withRuntimePortEnv(env, adjustedRuntimePorts),
  });
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { canListenOnPort, findAvailablePort };
