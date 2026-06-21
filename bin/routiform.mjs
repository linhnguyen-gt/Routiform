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
 *   routiform --no-menu    Skip menu, show logs (legacy behavior for CI)
 *   routiform --verbose    Show all logs even with menu
 *   routiform --help       Show help
 *   routiform --version    Show version
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import * as readline from "node:readline";
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

// ── Management CLI dispatch ──────────────────────────────────
// If the first arg is a known management noun, route to the CLI dispatcher
// instead of the interactive server launcher.
const MANAGEMENT_NOUNS = new Set([
  "provider",
  "key",
  "combo",
  "model",
  "settings",
  "status",
  "usage",
  "logs",
]);
if (args.length > 0 && MANAGEMENT_NOUNS.has(args[0])) {
  try {
    const { run } = await import("./cli/dispatch.mjs");
    await run(args);
  } catch (err) {
    console.error("\x1b[31m✖ CLI error:\x1b[0m", err.message || err);
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  \x1b[1m\x1b[36m⚡ Routiform\x1b[0m — Smart AI Router with Auto Fallback

  \x1b[1mUsage:\x1b[0m
    routiform                 Start the server
    routiform --port <port>   Use custom API port (default: 20128)
    routiform --no-open       Don't open browser automatically
    routiform --mcp           Start MCP server (stdio transport for IDEs)
    routiform --no-menu       Skip menu, show logs (legacy behavior for CI)
    routiform --verbose       Show all logs even with menu
    routiform --help          Show this help
    routiform --version       Show version

  \x1b[1mManagement CLI:\x1b[0m
    routiform provider list       List providers
    routiform key create <name>   Create an API key
    routiform combo list           List combos
    routiform status               Show server status
    routiform settings get         Show settings
    Run "routiform <noun> --help" for per-command help.

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
const noMenu = args.includes("--no-menu");
const verbose = args.includes("--verbose");

// ── TTY Detection ──────────────────────────────────────────
// If stdout is not a TTY (pipe, CI, cron, docker non-interactive),
// force --no-menu behavior to avoid ANSI escape codes in logs.
const isTTY = process.stdout.isTTY;
const useMenu = isTTY && !noMenu;

// ── Banner ─────────────────────────────────────────────────
console.log(`
\x1b[36m
  ____  _                            _ __
 |  _ \\| |_ ___ _ __ ___    __ _ _ __| |\\ \\
 | |_) | __/ _ \\ '_ \` _ \\  / _\` | '__| |/ /
 |  _ <| || (_) | | | | | | (_| | |  |   <
 |_| \\_\\\\__\\___/|_| |_| |_|\\__,_|_|  |_|\\_\\
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

// ── Log Buffer ────────────────────────────────────────────
// Circular buffer holding last 100 lines of server output
const LOG_MAX = 100;
const logBuffer = [];
let logBufIdx = 0;

function appendLogBuffer(text) {
  // Split multi-line chunks into individual lines for cleaner display
  const lines = text.split("\n");
  for (const line of lines) {
    if (logBuffer.length < LOG_MAX) {
      logBuffer.push(line);
    } else {
      logBuffer[logBufIdx % LOG_MAX] = line;
    }
    logBufIdx++;
  }
}

function getBufferedLogs() {
  if (logBuffer.length < LOG_MAX) {
    return logBuffer.join("\n");
  }
  // Circular buffer has wrapped — reconstruct in order
  const start = logBufIdx % LOG_MAX;
  const ordered = [...logBuffer.slice(start), ...logBuffer.slice(0, start)];
  return ordered.join("\n");
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

// Crash pattern keywords — show these immediately even when buffering
const CRASH_PATTERNS = [
  "EADDRINUSE",
  "EACCES",
  "Cannot find module",
  "FATAL",
  "Unhandled",
  "uncaughtException",
];

function isCrashMessage(text) {
  return CRASH_PATTERNS.some((p) => text.includes(p));
}

server.stdout.on("data", (data) => {
  const text = data.toString();
  appendLogBuffer(text);

  if (!useMenu || verbose) {
    process.stdout.write(text);
  } else if (isCrashMessage(text)) {
    process.stderr.write(text);
  }

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
  const text = data.toString();
  appendLogBuffer(text);

  if (!useMenu || verbose) {
    process.stderr.write(text);
  } else if (isCrashMessage(text)) {
    process.stderr.write(text);
  }
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

// ── Version ───────────────────────────────────────────────
let versionString = "unknown";
try {
  const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  versionString = version;
} catch {
  // keep unknown
}

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

// ── ANSI helpers ───────────────────────────────────────────
const CSI = "\x1b[";
const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
const MOVE_UP = (n) => `${CSI}${n}A`;
const ERASE_LINE = `${CSI}2K`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
const CYAN = `${CSI}36m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const WHITE = `${CSI}37m`;
const RESET = `${CSI}0m`;

function clearScreen() {
  process.stdout.write(CLEAR_SCREEN);
}

// ── Menu System ────────────────────────────────────────────
let menuActive = false;
let menuSelectedIdx = 0;
const MENU_ITEMS = [
  { label: "Web UI (Open in Browser)", action: "web", icon: "★" },
  { label: "Terminal UI (Interactive CLI)", action: "repl", icon: "☆" },
  { label: "Hide to Tray (Background)", action: "tray", icon: "☆" },
  { label: "Exit", action: "exit", icon: "☆" },
];

function renderMenu() {
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl = `http://localhost:${apiPort}`;

  // Build menu output
  let out = "";
  out += `\n${CLEAR_SCREEN}`;
  out += `${CYAN}${BOLD}========================================${RESET}\n`;
  out += `${CYAN}${BOLD}  Routiform v${versionString}${RESET}\n`;
  out += `  🚀 Server: ${dashboardUrl}\n`;
  out += `  🔌 API:    ${apiUrl}/v1\n`;
  out += `${CYAN}${BOLD}========================================${RESET}\n`;
  out += `\n`;

  for (let i = 0; i < MENU_ITEMS.length; i++) {
    const item = MENU_ITEMS[i];
    const selected = i === menuSelectedIdx;
    if (selected) {
      out += ` ${GREEN}▶ ${item.icon} ${item.label}${RESET}\n`;
    } else {
      out += `   ${DIM}${item.icon} ${item.label}${RESET}\n`;
    }
  }

  out += `\n${DIM}Use ↑/↓ arrow keys to navigate, Enter to select${RESET}\n`;
  out += CURSOR_HIDE;

  process.stdout.write(out);
}

async function openBrowser(url) {
  try {
    const open = await import("open");
    await open.default(url);
  } catch {
    // open is optional — if not available, just skip
  }
}

// ── REPL Terminal UI ──────────────────────────────────────
let replActive = false;
let replRl = null;

async function handleReplCommand(cmd) {
  const trimmed = cmd.trim();

  if (!trimmed) {
    return;
  }

  switch (trimmed) {
    case "health": {
      const apiUrl = `http://localhost:${apiPort}`;
      try {
        const res = await fetch(`${apiUrl}/v1/health`);
        const body = await res.text();
        process.stdout.write(`\n${GREEN}${body}${RESET}\n`);
      } catch (err) {
        process.stdout.write(`\n${YELLOW}Health check failed: ${err.message}${RESET}\n`);
      }
      break;
    }

    case "combos": {
      const apiUrl = `http://localhost:${apiPort}`;
      try {
        const res = await fetch(`${apiUrl}/v1/combos`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            process.stdout.write(`\n${BOLD}Active Combos (${data.length}):${RESET}\n`);
            for (const combo of data) {
              const name = combo.name || combo.id || "unnamed";
              const active =
                combo.active !== false ? `${GREEN}active${RESET}` : `${DIM}inactive${RESET}`;
              process.stdout.write(`  ${GREEN}▪${RESET} ${name} [${active}]\n`);
            }
          } else {
            process.stdout.write(`\n${GREEN}${JSON.stringify(data, null, 2)}${RESET}\n`);
          }
        } else {
          process.stdout.write(`\n${YELLOW}Failed to fetch combos (HTTP ${res.status})${RESET}\n`);
        }
      } catch (err) {
        process.stdout.write(`\n${YELLOW}Failed to fetch combos: ${err.message}${RESET}\n`);
      }
      break;
    }

    case "quota": {
      const apiUrl = `http://localhost:${apiPort}`;
      try {
        const res = await fetch(`${apiUrl}/v1/quota`);
        const body = await res.text();
        process.stdout.write(`\n${GREEN}${body}${RESET}\n`);
      } catch (err) {
        process.stdout.write(`\n${YELLOW}Quota check failed: ${err.message}${RESET}\n`);
      }
      break;
    }

    case "route": {
      process.stdout.write(`\n${YELLOW}Usage: route <model-name>${RESET}\n`);
      process.stdout.write(`Example: route openai/gpt-4o\n`);
      break;
    }

    case "logs": {
      const logs = getBufferedLogs();
      process.stdout.write(`\n${DIM}── Server Logs (last ${LOG_MAX} lines) ──${RESET}\n`);
      process.stdout.write(logs || "(no logs yet)");
      process.stdout.write(`\n${DIM}── End of logs ──${RESET}\n`);
      break;
    }

    case "clear": {
      clearScreen();
      break;
    }

    case "exit": {
      replActive = false;
      if (replRl) {
        replRl.close();
        replRl = null;
      }
      process.stdout.write(CURSOR_HIDE);
      menuActive = true;
      renderMenu();
      break;
    }

    default: {
      // Check for "route <model>" command
      if (trimmed.startsWith("route ")) {
        const model = trimmed.slice(6).trim();
        if (model) {
          const apiUrl = `http://localhost:${apiPort}`;
          process.stdout.write(`\n${DIM}Routing test for model: ${model}...${RESET}\n`);
          try {
            const res = await fetch(`${apiUrl}/v1/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "Hello, this is a test route. Say hi." }],
                max_tokens: 20,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              const content = data?.choices?.[0]?.message?.content || JSON.stringify(data);
              process.stdout.write(`\n${GREEN}✓ Route OK: ${content}${RESET}\n`);
            } else {
              const errBody = await res.text();
              process.stdout.write(
                `\n${YELLOW}✖ Route failed (HTTP ${res.status}): ${errBody}${RESET}\n`
              );
            }
          } catch (err) {
            process.stdout.write(`\n${YELLOW}✖ Route error: ${err.message}${RESET}\n`);
          }
        } else {
          process.stdout.write(`\n${YELLOW}Usage: route <model-name>${RESET}\n`);
        }
      } else {
        process.stdout.write(`\n${YELLOW}Unknown command: ${trimmed}${RESET}\n`);
        process.stdout.write(
          `${DIM}Available: health, combos, quota, route <model>, logs, clear, exit${RESET}\n`
        );
      }
      break;
    }
  }

  // Re-show the prompt
  if (replActive && replRl) {
    replRl.prompt(true);
  }
}

function startRepl() {
  replActive = true;
  menuActive = false;
  process.stdout.write(CURSOR_SHOW);
  clearScreen();

  const apiUrl = `http://localhost:${apiPort}`;
  process.stdout.write(`${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}\n`);
  process.stdout.write(
    `${CYAN}${BOLD}║${RESET}     ${BOLD}Routiform Terminal UI${RESET}              ${CYAN}${BOLD}║${RESET}\n`
  );
  process.stdout.write(
    `${CYAN}${BOLD}║${RESET}     Server: ${dashboardPort}                       ${CYAN}${BOLD}║${RESET}\n`
  );
  process.stdout.write(`${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}\n`);
  process.stdout.write(
    `\n${DIM}Commands: health, combos, quota, route <model>, logs, clear, exit${RESET}\n\n`
  );

  replRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}routiform> ${RESET}`,
    terminal: true,
  });

  replRl.prompt();

  replRl.on("line", (line) => {
    handleReplCommand(line);
  });

  replRl.on("close", () => {
    if (replActive) {
      // User pressed Ctrl+D in REPL → return to menu
      replActive = false;
      process.stdout.write(CURSOR_HIDE);
      menuActive = true;
      renderMenu();
    }
  });
}

// ── Menu key handler ──────────────────────────────────────
function handleMenuKey(str, key) {
  if (!menuActive) return;

  if (key.name === "up") {
    menuSelectedIdx = (menuSelectedIdx - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
    renderMenu();
  } else if (key.name === "down") {
    menuSelectedIdx = (menuSelectedIdx + 1) % MENU_ITEMS.length;
    renderMenu();
  } else if (key.name === "return" || key.name === "enter") {
    const selected = MENU_ITEMS[menuSelectedIdx];
    executeMenuAction(selected.action);
  }
}

async function executeMenuAction(action) {
  const dashboardUrl = `http://localhost:${dashboardPort}`;

  switch (action) {
    case "web":
      process.stdout.write(CURSOR_SHOW);
      clearScreen();
      console.log(`  ${GREEN}✔ Opening Web UI...${RESET}\n`);
      if (!noOpen) {
        await openBrowser(dashboardUrl);
      } else {
        console.log(`  ${YELLOW}--no-open flag set, skipping browser${RESET}`);
        console.log(`  Dashboard: ${dashboardUrl}\n`);
      }
      // After opening browser, return to menu (don't exit)
      process.stdout.write(CURSOR_HIDE);
      menuActive = true;
      renderMenu();
      break;

    case "repl":
      process.stdout.write(CURSOR_SHOW);
      startRepl();
      break;

    case "tray":
      process.stdout.write(CURSOR_SHOW);
      clearScreen();
      console.log(`\n  ${CYAN}${BOLD}⚡ Routiform is running in background${RESET}\n`);
      console.log(`  ${DIM}Server:${RESET}  http://localhost:${dashboardPort}`);
      console.log(`  ${DIM}API:${RESET}     http://localhost:${apiPort}/v1\n`);
      console.log(`  ${DIM}To stop:${RESET}   pkill -f "node.*routiform"`);
      console.log(`  ${DIM}Or:${RESET}        kill ${server.pid}\n`);
      // Detach from terminal
      process.stdin.setRawMode(false);
      process.stdin.pause();
      menuActive = false;
      // Keep server running in background
      break;

    case "exit":
      process.stdout.write(CURSOR_SHOW);
      clearScreen();
      shutdown();
      break;

    default:
      break;
  }
}

// ── Initialize menu key handler ───────────────────────────
if (useMenu) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on("keypress", handleMenuKey);
} else {
  // Legacy behavior: no menu, clean exit
  process.stdin.resume();
}

// ── On ready ───────────────────────────────────────────────
async function onReady() {
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl = `http://localhost:${apiPort}`;

  if (!useMenu) {
    // Legacy / --no-menu mode: print status and exit cleanly
    console.log(`
  \x1b[32m✔ Routiform is running!\x1b[0m

  \x1b[1m  Dashboard:\x1b[0m  ${dashboardUrl}
  \x1b[1m  API Base:\x1b[0m   ${apiUrl}/v1

  \x1b[2m  Point your CLI tool (Cursor, Cline, Codex) to:\x1b[0m
  \x1b[33m  ${apiUrl}/v1\x1b[0m

  \x1b[2m  Press Ctrl+C to stop\x1b[0m
  `);

    if (!noOpen) {
      await openBrowser(dashboardUrl);
    }
    return;
  }

  // Interactive menu mode
  if (!noOpen) {
    await openBrowser(dashboardUrl);
  }

  menuActive = true;
  menuSelectedIdx = 0;
  renderMenu();
}

// Fallback: if no "Ready" message detected in 15s, assume server is up
setTimeout(() => {
  if (!started) {
    started = true;
    onReady();
  }
}, 15000);
