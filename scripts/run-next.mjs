#!/usr/bin/env node

import {
  resolveRuntimePorts,
  withRuntimePortEnv,
  spawnWithForwardedSignals,
} from "./runtime-env.mjs";
import { bootstrapEnv } from "./bootstrap-env.mjs";

const mode = process.argv[2] === "start" ? "start" : "dev";

// Load .env / server.env first so PORT / DASHBOARD_PORT from files affect --port below.
const env = bootstrapEnv();
const runtimePorts = resolveRuntimePorts(env);
const { dashboardPort } = runtimePorts;

const args = ["./node_modules/next/dist/bin/next", mode, "--port", String(dashboardPort)];
// Default dev: Turbopack (Tailwind CSS v4 + `@import "tailwindcss"` requires PostCSS; webpack dev
// can fail to apply postcss.config.mjs in some setups). Set OMNIROUTE_USE_WEBPACK=1 to force
// `--webpack` if you need the legacy bundler.
// Must read merged `env` from bootstrap — .env is not applied to process.env in the launcher.
if (mode === "dev" && env.OMNIROUTE_USE_WEBPACK === "1") {
  args.splice(2, 0, "--webpack");
}

spawnWithForwardedSignals(process.execPath, args, {
  stdio: "inherit",
  env: withRuntimePortEnv(env, runtimePorts),
});
