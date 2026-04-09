#!/usr/bin/env node

/**
 * Routiform CLI — Smart AI Router with Auto Fallback
 * Global npm entry for the Routiform server CLI.
 *
 * Usage:
 *   routiform              Start the server (default port 20128)
 *   routiform --port 3000  Start on custom port
 *   routiform --no-open    Start without opening browser
 *   routiform --mcp        Start MCP server (stdio transport for IDEs)
 *   routiform --help       Show help
 *   routiform --version    Show version
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import { isNativeBinaryCompatible } from "../scripts/native-binary-compat.mjs";
import { bootstrapEnv } from "../scripts/bootstrap-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const APP_DIR = join(ROOT, "app");

// ── Load .env file (for global npm install) ─────────────────
function loadEnvFile() {
  const envPaths = [];

  // 1. DATA_DIR/.env if set
  if (process.env.DATA_DIR) {
    envPaths.push(join(process.env.DATA_DIR, ".env"));
  }

  // 2. Default data dir: ~/.routiform/.env (Windows: %AppData%/routiform/.env)
  const home = homedir();
  if (home) {
    if (platform() === "win32") {
      const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
      envPaths.push(join(appData, "routiform", ".env"));
    } else {
      envPaths.push(join(home, ".routiform", ".env"));
    }
  }

  // 3. ./.env (current working directory)
  envPaths.push(join(process.cwd(), ".env"));

  for (const envPath of envPaths) {
    try {
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            // Don't override existing env vars
            if (process.env[key] === undefined) {
              // Remove surrounding quotes
              process.env[key] = value.replace(/^["']|["']$/g, "");
            }
          }
        }
        console.log(`  \x1b[2m📋 Loaded env from ${envPath}\x1b[0m`);
        return;
      }
    } catch {
      // Ignore errors reading env files
    }
  }
}

loadEnvFile();

// ── Bootstrap environment (load server.env, auto-generate secrets) ──
// This matches Docker's run-standalone.mjs behavior. Without it,
// server.env (containing JWT_SECRET, STORAGE_ENCRYPTION_KEY) is never
// loaded after backup imports, causing stuck /login redirects.
const bootstrappedEnv = bootstrapEnv({ quiet: false });

// ── Parse args ─────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  \x1b[1m\x1b[36m⚡ Routiform\x1b[0m — Smart AI Router with Auto Fallback

  \x1b[1mUsage:\x1b[0m
    routiform                 Start the server
    routiform --port <port>   Use custom API port (default: 20128)
    routiform --no-open       Don't open browser automatically
    routiform --mcp           Start MCP server (stdio transport for IDEs)
    routiform --help          Show this help
    routiform --version       Show version

  \x1b[1mMCP Integration:\x1b[0m
    The --mcp flag starts an MCP server over stdio, exposing Routiform
    tools for AI agents in VS Code, Cursor, Claude Desktop, and Copilot.

    Available tools: routiform_get_health, routiform_list_combos,
    routiform_check_quota, routiform_route_request, and more.

  \x1b[1mConfig:\x1b[0m
    Loads .env from: ~/.routiform/.env or ./.env
    Memory limit: ROUTIFORM_MEMORY_MB (default: 512)

  \x1b[1mAfter starting:\x1b[0m
    Dashboard:  http://localhost:<dashboard-port>
    API:        http://localhost:<api-port>/v1

  \x1b[1mConnect your tools:\x1b[0m
    Set your CLI tool (Cursor, Cline, Codex, etc.) to use:
    \x1b[33mhttp://localhost:<api-port>/v1\x1b[0m
  `);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  try {
    const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    console.log(version);
  } catch {
    console.log("unknown");
  }
  process.exit(0);
}

// ── MCP Server Mode ───────────────────────────────────────
if (args.includes("--mcp")) {
  try {
    const { startMcpCli } = await import(join(ROOT, "bin", "mcp-server.mjs"));
    await startMcpCli(ROOT);
  } catch (err) {
    console.error("\x1b[31m✖ Failed to start MCP server:\x1b[0m", err.message || err);
    process.exit(1);
  }
  process.exit(0);
}

function parsePort(value, fallback) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

// Parse --port (canonical/base port)
let port = parsePort(process.env.PORT || "20128", 20128);
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  const cliPort = parsePort(args[portIdx + 1], null);
  if (cliPort === null) {
    console.error("\x1b[31m✖ Invalid port number\x1b[0m");
    process.exit(1);
  }
  port = cliPort;
}

const apiPort = parsePort(process.env.API_PORT || String(port), port);
const dashboardPort = parsePort(process.env.DASHBOARD_PORT || String(port), port);

const noOpen = args.includes("--no-open");

// ── Banner ─────────────────────────────────────────────────
console.log(`
\x1b[36m   ____                  _ ____              _
   / __ \\                (_) __ \\            | |
  | |  | |_ __ ___  _ __ _| |__) |___  _   _| |_ ___
  | |  | | '_ \` _ \\| '_ \\ |  _  // _ \\| | | | __/ _ \\
  | |__| | | | | | | | | | | | \\ \\ (_) | |_| | ||  __/
   \\____/|_| |_| |_|_| |_|_|_|  \\_\\___/ \\__,_|\\__\\___|
\x1b[0m`);

// ── Node.js runtime note ───────────────────────────────────
// Keep this advisory light-touch: modern Node versions can work fine,
// but some environments may still need a native rebuild for better-sqlite3.
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
const isLtsNode = Boolean(process.release?.lts);
if (nodeMajor >= 24 && !isLtsNode) {
  console.warn(`\x1b[33m  ⚠  Node.js ${process.versions.node} detected (non-LTS build).
     Routiform works best on an LTS runtime for maximum native addon stability.
     If you hit better-sqlite3 errors, run: npm rebuild better-sqlite3\x1b[0m
`);
}

// ── Resolve server entry ───────────────────────────────────
const serverJs = join(APP_DIR, "server.js");

if (!existsSync(serverJs)) {
  console.error("\x1b[31m✖ Server not found at:\x1b[0m", serverJs);
  console.error("  The package may not have been built correctly.");
  console.error("");
  // (#492) Detect common non-standard Node managers that cause this issue
  const nodeExec = process.execPath || "";
  const isMise = nodeExec.includes("mise") || nodeExec.includes(".local/share/mise");
  const isNvm = nodeExec.includes(".nvm") || nodeExec.includes("nvm");
  if (isMise) {
    console.error(
      "  \x1b[33m⚠ mise detected:\x1b[0m If you installed via `npm install -g routiform`,"
    );
    console.error("    try: \x1b[36mnpx routiform@latest\x1b[0m  (downloads a fresh copy)");
    console.error("    or:  \x1b[36mmise exec -- npx routiform\x1b[0m");
  } else if (isNvm) {
    console.error(
      "  \x1b[33m⚠ nvm detected:\x1b[0m Try reinstalling after loading the correct Node version:"
    );
    console.error("    \x1b[36mnvm use --lts && npm install -g routiform\x1b[0m");
  } else {
    console.error("  Try: \x1b[36mnpm install -g routiform\x1b[0m  (reinstall)");
    console.error("  Or:  \x1b[36mnpx routiform@latest\x1b[0m");
  }
  process.exit(1);
}

// ── Pre-flight: verify better-sqlite3 native binary ───────
// Verify the binary's actual target platform/arch before trusting dlopen.
// This avoids the macOS false positive where a bundled linux-x64 addon can
// appear to load even though the runtime will fail when better-sqlite3 starts.
const sqliteBinary = join(
  APP_DIR,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
if (existsSync(sqliteBinary) && !isNativeBinaryCompatible(sqliteBinary)) {
  console.error(
    "\x1b[31m✖ better-sqlite3 native module is incompatible with this platform.\x1b[0m"
  );
  console.error(`  Run: cd ${APP_DIR} && npm rebuild better-sqlite3`);
  if (platform() === "darwin") {
    console.error("  If build tools are missing: xcode-select --install");
  }
  process.exit(1);
}

// ── Start server ───────────────────────────────────────────
console.log(`  \x1b[2m⏳ Starting server...\x1b[0m\n`);

// Sanitize memory limit — parseInt to prevent command injection (#150)
const rawMemory = parseInt(process.env.ROUTIFORM_MEMORY_MB || "512", 10);
const memoryLimit =
  Number.isFinite(rawMemory) && rawMemory >= 64 && rawMemory <= 16384 ? rawMemory : 512;

const env = {
  ...bootstrappedEnv,
  ROUTIFORM_PORT: String(port),
  PORT: String(dashboardPort),
  DASHBOARD_PORT: String(dashboardPort),
  API_PORT: String(apiPort),
  HOSTNAME: "0.0.0.0",
  NODE_ENV: "production",
  NODE_OPTIONS: `--max-old-space-size=${memoryLimit}`,
};

const server = spawn("node", [`--max-old-space-size=${memoryLimit}`, serverJs], {
  cwd: APP_DIR,
  env,
  stdio: "pipe",
});

let started = false;

server.stdout.on("data", (data) => {
  const text = data.toString();
  process.stdout.write(text);

  // Detect server ready
  if (
    !started &&
    (text.includes("Ready") || text.includes("started") || text.includes("listening"))
  ) {
    started = true;
    onReady();
  }
});

server.stderr.on("data", (data) => {
  process.stderr.write(data);
});

server.on("error", (err) => {
  console.error("\x1b[31m✖ Failed to start server:\x1b[0m", err.message);
  process.exit(1);
});

server.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\x1b[31m✖ Server exited with code ${code}\x1b[0m`);
  }
  process.exit(code ?? 0);
});

// ── Graceful shutdown ──────────────────────────────────────
function shutdown() {
  console.log("\n\x1b[33m⏹ Shutting down Routiform...\x1b[0m");
  server.kill("SIGTERM");
  setTimeout(() => {
    server.kill("SIGKILL");
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── On ready ───────────────────────────────────────────────
async function onReady() {
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl = `http://localhost:${apiPort}`;

  console.log(`
  \x1b[32m✔ Routiform is running!\x1b[0m

  \x1b[1m  Dashboard:\x1b[0m  ${dashboardUrl}
  \x1b[1m  API Base:\x1b[0m   ${apiUrl}/v1

  \x1b[2m  Point your CLI tool (Cursor, Cline, Codex) to:\x1b[0m
  \x1b[33m  ${apiUrl}/v1\x1b[0m

  \x1b[2m  Press Ctrl+C to stop\x1b[0m
  `);

  if (!noOpen) {
    try {
      const open = await import("open");
      await open.default(dashboardUrl);
    } catch {
      // open is optional — if not available, just skip
    }
  }
}

// Fallback: if no "Ready" message detected in 15s, assume server is up
setTimeout(() => {
  if (!started) {
    started = true;
    onReady();
  }
}, 15000);
