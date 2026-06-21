import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import net from "net";
import { resolveDataDir } from "@/lib/dataPaths";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

const execFileAsync = promisify(execFile);

const OPEN_WEBUI_PORT = 8080;
const OPEN_WEBUI_VERSION = "v0.6.40";
// Sibling container hostname on the shared Docker compose network
const DOCKER_OPEN_WEBUI_HOST = "routiform-open-webui";
const START_TIMEOUT_MS = 180000;
const STOP_TIMEOUT_MS = 10000;
const PORT_PROBE_TIMEOUT_MS = 1500;
const POLL_INTERVAL_MS = 1500;

const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "WINDIR",
  "PATHEXT",
  "TMPDIR",
  "TMP",
  "TEMP",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
] as const;

export type OpenWebuiRuntime = "uvx" | "pip" | "docker" | "not_available";

export type OpenWebuiPhase = "not_available" | "stopped" | "starting" | "running" | "error";

export type OpenWebuiStatus = {
  phase: OpenWebuiPhase;
  runtime: OpenWebuiRuntime;
  dockerMode: boolean;
  url: string | null;
  reachable: boolean;
  pid: number | null;
  lastError: string | null;
  logPath: string;
};

let openWebuiProcess: ReturnType<typeof spawn> | null = null;
let openWebuiPid: number | null = null;
let startPromise: Promise<OpenWebuiStatus> | null = null;

function isDockerMode(): boolean {
  return process.env.DOCKER === "true";
}

function getOpenWebuiDir() {
  return path.join(resolveDataDir(), "open-webui");
}

function getLogFilePath() {
  return path.join(getOpenWebuiDir(), "open-webui.log");
}

function getStateFilePath() {
  return path.join(getOpenWebuiDir(), "open-webui-state.json");
}

interface PersistedState {
  ownerPid?: number | null;
  pid?: number | null;
  status?: OpenWebuiPhase;
  lastError?: string | null;
  startedAt?: string | null;
}

async function ensureDir() {
  await fs.mkdir(getOpenWebuiDir(), { recursive: true });
}

async function appendLog(source: "stdout" | "stderr", message: string) {
  await ensureDir();
  const timestamp = new Date().toISOString();
  await fs.appendFile(getLogFilePath(), `[${timestamp}] [${source}] ${message}\n`, "utf8");
}

async function readState(): Promise<PersistedState> {
  try {
    const content = await fs.readFile(getStateFilePath(), "utf8");
    return JSON.parse(content) as PersistedState;
  } catch {
    return {};
  }
}

async function writeState(state: PersistedState) {
  await ensureDir();
  await fs.writeFile(getStateFilePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function patchState(patch: PersistedState) {
  const current = await readState();
  await writeState({ ...current, ...patch });
}

function isProcessAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resolvePathCommand(command: string): Promise<string | null> {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], { timeout: 3000 });
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

export async function resolveRuntime(): Promise<OpenWebuiRuntime> {
  if (isDockerMode()) return "docker";

  const uvxPath = await resolvePathCommand("uvx");
  if (uvxPath) return "uvx";

  const openWebuiPath = await resolvePathCommand("open-webui");
  if (openWebuiPath) return "pip";

  return "not_available";
}

function buildStartCommand(runtime: OpenWebuiRuntime): { binary: string; args: string[] } | null {
  if (runtime === "uvx") {
    return {
      binary: "uvx",
      args: [
        "--python",
        "3.11",
        `open-webui@${OPEN_WEBUI_VERSION}`,
        "serve",
        "--port",
        String(OPEN_WEBUI_PORT),
      ],
    };
  }
  if (runtime === "pip") {
    return {
      binary: "open-webui",
      args: ["serve", "--port", String(OPEN_WEBUI_PORT)],
    };
  }
  return null;
}

function buildChildEnv(apiKey: string): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      childEnv[key] = value;
    }
  }

  const { apiPort } = getRuntimePorts();
  childEnv.WEBUI_AUTH = "False";
  childEnv.OPENAI_API_BASE_URL = `http://localhost:${apiPort}/v1`;
  childEnv.OPENAI_API_KEY = apiKey;
  childEnv.DATA_DIR = getOpenWebuiDir();
  childEnv.PORT = String(OPEN_WEBUI_PORT);
  childEnv.HOST = "0.0.0.0";
  // Allow the dashboard to embed Open WebUI in an iframe instead of opening a new tab.
  childEnv.ENABLE_FRAME_EMBEDDING = "true";

  return childEnv;
}

async function ensureApiKey(): Promise<string> {
  const keys = await getApiKeys();
  const existing = keys.find((k) => k.name === "open-webui");
  if (existing && typeof existing.key === "string" && existing.key.length > 0) {
    return existing.key;
  }

  const machineId = await getConsistentMachineId();
  const created = await createApiKey("open-webui", machineId);
  return created.key;
}

export async function isPortReachable(
  port: number = OPEN_WEBUI_PORT,
  host?: string
): Promise<boolean> {
  // In Docker mode, Open WebUI runs as a sibling container — 127.0.0.1 from inside the
  // routiform container only reaches routiform itself, never the sibling.
  const targetHost = host ?? (isDockerMode() ? DOCKER_OPEN_WEBUI_HOST : "127.0.0.1");
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });
    socket.once("error", () => {
      cleanup();
      resolve(false);
    });
    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });
    socket.connect(port, targetHost);
  });
}

async function killPid(pid: number) {
  process.kill(pid, "SIGTERM");
  const start = Date.now();
  while (Date.now() - start < STOP_TIMEOUT_MS) {
    if (!isProcessAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore — process may have exited between check and kill
    }
  }
}

export async function getOpenWebuiStatus(): Promise<OpenWebuiStatus> {
  const dockerMode = isDockerMode();
  const reachable = await isPortReachable();

  // In Docker mode the compose service manages the Open WebUI process — no local PID tracking.
  // Reachability over the compose network is the only signal we need.
  if (dockerMode) {
    // OPEN_WEBUI_HOST_PORT is the host-facing port (set via ${OPEN_WEBUI_PORT:-8080} in compose).
    // It may differ from the container-internal port (always 8080) if the user changed the mapping
    // to avoid a port conflict. We probe the internal port; we expose the host port in the URL.
    const hostPort = parseInt(process.env.OPEN_WEBUI_HOST_PORT ?? String(OPEN_WEBUI_PORT), 10);
    return {
      phase: reachable ? "running" : "stopped",
      runtime: "docker",
      dockerMode: true,
      url: reachable ? `http://localhost:${hostPort}/?ow_v=${OPEN_WEBUI_VERSION}` : null,
      reachable,
      pid: null,
      lastError: null,
      logPath: getLogFilePath(),
    };
  }

  const runtime = await resolveRuntime();
  const state = await readState();
  const trustedPid = openWebuiPid || (state.ownerPid === process.pid ? state.pid : null);
  const running = isProcessAlive(trustedPid);

  let phase: OpenWebuiPhase;
  if (runtime === "not_available") {
    phase = "not_available";
  } else if (running && reachable) {
    phase = "running";
  } else if (running) {
    phase = "starting";
  } else if (state.lastError) {
    phase = "error";
  } else {
    phase = "stopped";
  }

  if (!running && state.pid) {
    await patchState({ pid: null });
  }

  return {
    phase,
    runtime,
    dockerMode: false,
    url: reachable ? `http://localhost:${OPEN_WEBUI_PORT}/?ow_v=${OPEN_WEBUI_VERSION}` : null,
    reachable,
    pid: running ? trustedPid : null,
    lastError: running ? null : state.lastError || null,
    logPath: getLogFilePath(),
  };
}

async function stopExisting() {
  if (openWebuiProcess && openWebuiPid && !openWebuiProcess.killed) {
    const pid = openWebuiPid;
    openWebuiProcess.kill("SIGTERM");
    await killPid(pid);
    openWebuiProcess = null;
    openWebuiPid = null;
    return;
  }

  const state = await readState();
  if (state.ownerPid === process.pid && state.pid && isProcessAlive(state.pid)) {
    await killPid(state.pid);
  }
  await patchState({ pid: null, ownerPid: null });
  openWebuiProcess = null;
  openWebuiPid = null;
}

export async function startOpenWebui(): Promise<OpenWebuiStatus> {
  const current = await getOpenWebuiStatus();
  if (current.phase === "running") return current;
  if (current.phase === "not_available") {
    throw new Error(
      "Open WebUI runtime not available. Install uv + Python 3.11 or open-webui (pip)."
    );
  }
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const runtime = await resolveRuntime();
    const command = buildStartCommand(runtime);
    if (!command) {
      throw new Error(`Cannot start Open WebUI with runtime: ${runtime}`);
    }

    await stopExisting();
    await ensureDir();
    await fs.writeFile(getLogFilePath(), "", "utf8");

    let apiKey: string;
    try {
      apiKey = await ensureApiKey();
    } catch (error) {
      throw new Error(
        `Failed to provision Open WebUI API key: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await writeState({
      ownerPid: process.pid,
      pid: null,
      status: "starting",
      lastError: null,
      startedAt: new Date().toISOString(),
    });

    const child = spawn(command.binary, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: buildChildEnv(apiKey),
      detached: false,
    });

    openWebuiProcess = child;
    openWebuiPid = child.pid ?? null;

    if (!child.pid) {
      await patchState({ status: "error", lastError: "Failed to spawn Open WebUI process" });
      throw new Error("Open WebUI failed to start");
    }

    await patchState({ pid: child.pid, ownerPid: process.pid, status: "starting" });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) void appendLog("stdout", text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) void appendLog("stderr", text);
    });

    child.once("exit", async (code, signal) => {
      openWebuiProcess = null;
      openWebuiPid = null;
      const failed = code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT";
      await patchState({
        ownerPid: null,
        pid: null,
        status: failed ? "error" : "stopped",
        lastError: failed
          ? `Open WebUI exited (code=${code ?? "signal"}${signal ? `/${signal}` : ""})`
          : null,
      });
    });

    const ready = await new Promise<OpenWebuiStatus>((resolve, reject) => {
      const start = Date.now();
      let exitedEarly = false;
      const onExit = () => {
        exitedEarly = true;
      };
      child.once("exit", onExit);

      const poll = async () => {
        if (exitedEarly || !openWebuiProcess) {
          const stateAfter = await readState();
          reject(new Error(stateAfter.lastError || "Open WebUI exited before becoming reachable"));
          return;
        }
        if (isProcessAlive(openWebuiPid)) {
          const reachable = await isPortReachable();
          if (reachable) {
            child.removeListener("exit", onExit);
            await patchState({ status: "running", lastError: null });
            const status = await getOpenWebuiStatus();
            resolve(status);
            return;
          }
        }
        if (Date.now() - start > START_TIMEOUT_MS) {
          child.removeListener("exit", onExit);
          reject(new Error("Timed out waiting for Open WebUI to become reachable"));
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      };
      void poll();
    });

    return ready;
  })();

  try {
    return await startPromise;
  } catch (error) {
    await patchState({
      status: "error",
      lastError: error instanceof Error ? error.message : "Failed to start Open WebUI",
    });
    throw error;
  } finally {
    startPromise = null;
  }
}

export async function stopOpenWebui(): Promise<OpenWebuiStatus> {
  if (isDockerMode()) {
    return getOpenWebuiStatus();
  }
  await stopExisting();
  await patchState({ status: "stopped", pid: null, lastError: null });
  return getOpenWebuiStatus();
}

export function isDockerInstallMode(): boolean {
  return isDockerMode();
}

export async function getOpenWebuiLogTail(maxLines: number = 40): Promise<string[]> {
  try {
    const content = await fs.readFile(getLogFilePath(), "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}
