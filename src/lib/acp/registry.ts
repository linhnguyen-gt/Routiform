/**
 * ACP (Agent Client Protocol) — CLI Agent Registry
 *
 * Discovers installed CLI tools on the system by checking standard paths
 * and running version commands. Used to offer ACP transport as an alternative
 * to the HTTP proxy method.
 *
 * Supports 14 built-in agents + user-defined custom agents from settings.
 *
 * Reference: https://github.com/iOfficeAI/AionUi (auto-detects CLI agents)
 */

import { execSync } from "child_process";

export interface CliAgentInfo {
  /** Agent identifier (e.g., "codex", "claude", "goose") */
  id: string;
  /** Display name */
  name: string;
  /** Binary name to spawn */
  binary: string;
  /** Version detection command */
  versionCommand: string;
  /** Detected version (null if not installed) */
  version: string | null;
  /** Whether the agent is installed and available */
  installed: boolean;
  /** Provider ID that this agent maps to in Routiform */
  providerAlias: string;
  /** Arguments to pass when spawning for ACP */
  spawnArgs: string[];
  /** Protocol used for communication */
  protocol: "stdio" | "http";
  /** Whether this is a user-defined custom agent */
  isCustom?: boolean;
}

/** Shape stored in settings DB for custom agents */
export interface CustomAgentDef {
  id: string;
  name: string;
  binary: string;
  versionCommand: string;
  providerAlias: string;
  spawnArgs: string[];
  protocol: "stdio" | "http";
}

/**
 * Registry of known CLI agents that support ACP or similar protocols.
 */
const AGENT_DEFINITIONS: Omit<CliAgentInfo, "version" | "installed">[] = [
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    binary: "codex",
    versionCommand: "codex --version",
    providerAlias: "codex",
    spawnArgs: ["--quiet"],
    protocol: "stdio",
  },
  {
    id: "claude",
    name: "Claude Code CLI",
    binary: "claude",
    versionCommand: "claude --version",
    providerAlias: "claude",
    spawnArgs: ["--print", "--output-format", "json"],
    protocol: "stdio",
  },
  {
    id: "goose",
    name: "Goose CLI",
    binary: "goose",
    versionCommand: "goose --version",
    providerAlias: "goose",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    binary: "gemini",
    versionCommand: "gemini --version",
    providerAlias: "gemini-cli",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    binary: "openclaw",
    versionCommand: "openclaw --version",
    providerAlias: "openclaw",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "aider",
    name: "Aider",
    binary: "aider",
    versionCommand: "aider --version",
    providerAlias: "aider",
    spawnArgs: ["--no-auto-commits"],
    protocol: "stdio",
  },
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    versionCommand: "opencode --version",
    providerAlias: "opencode",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "cline",
    name: "Cline",
    binary: "cline",
    versionCommand: "cline --version",
    providerAlias: "cline",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    binary: "qwen",
    versionCommand: "qwen --version",
    providerAlias: "qwen",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "forge",
    name: "ForgeCode",
    binary: "forge",
    versionCommand: "forge --version",
    providerAlias: "forge",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    binary: "q",
    versionCommand: "q --version",
    providerAlias: "amazon-q",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "interpreter",
    name: "Open Interpreter",
    binary: "interpreter",
    versionCommand: "interpreter --version",
    providerAlias: "interpreter",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "cursor-cli",
    name: "Cursor CLI",
    binary: "cursor",
    versionCommand: "cursor --version",
    providerAlias: "cursor",
    spawnArgs: [],
    protocol: "stdio",
  },
  {
    id: "warp",
    name: "Warp AI",
    binary: "warp",
    versionCommand: "warp --version",
    providerAlias: "warp",
    spawnArgs: [],
    protocol: "stdio",
  },
];

// ---------------------------------------------------------------------------
// Detection cache (60 seconds)
// ---------------------------------------------------------------------------
let _cachedAgents: CliAgentInfo[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

/** Custom agents loaded from settings */
let _customAgentDefs: CustomAgentDef[] = [];

/**
 * Set custom agent definitions from settings.
 */
export function setCustomAgents(agents: CustomAgentDef[]): void {
  _customAgentDefs = agents || [];
  _cachedAgents = null; // invalidate cache
}

/**
 * Get current custom agent definitions.
 */
export function getCustomAgentDefs(): CustomAgentDef[] {
  return _customAgentDefs;
}

/**
 * Detect a single agent by running its version command.
 */
function detectAgent(
  def: Omit<CliAgentInfo, "version" | "installed">,
  isCustom = false
): CliAgentInfo {
  let version: string | null = null;
  let installed = false;

  try {
    const output = execSync(def.versionCommand, {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Extract version number from output
    const versionMatch = output.match(/(\d+\.\d+\.\d+(?:-\w+)?)/);
    version = versionMatch ? versionMatch[1] : output.split("\n")[0];
    installed = true;
  } catch {
    // Not installed or not runnable
  }

  return { ...def, version, installed, isCustom };
}

/**
 * Detect installed CLI agents on the system.
 * Results are cached for 60 seconds.
 */
export function detectInstalledAgents(): CliAgentInfo[] {
  const now = Date.now();
  if (_cachedAgents && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedAgents;
  }

  // Merge built-in + custom definitions
  const allDefs = [
    ...AGENT_DEFINITIONS.map((d) => ({ ...d, _custom: false })),
    ..._customAgentDefs.map((d) => ({ ...d, _custom: true })),
  ];

  _cachedAgents = allDefs.map((def) => {
    const { _custom, ...rest } = def;
    return detectAgent(rest, _custom);
  });
  _cacheTimestamp = now;

  return _cachedAgents;
}

/**
 * Force refresh detection cache.
 */
export function refreshAgentCache(): CliAgentInfo[] {
  _cachedAgents = null;
  return detectInstalledAgents();
}

/**
 * Get a specific agent by ID.
 */
export function getAgentById(id: string): CliAgentInfo | undefined {
  const agents = detectInstalledAgents();
  return agents.find((a) => a.id === id);
}

/**
 * Get agents that are installed and available for ACP.
 */
export function getAvailableAgents(): CliAgentInfo[] {
  return detectInstalledAgents().filter((a) => a.installed);
}
