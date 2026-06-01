import { CLI_TOOLS } from "./cliTools";

/**
 * Provider IDs toggled in Settings -> CLI Fingerprint.
 *
 * Source of truth:
 * - derive from visible CLI tools when a provider mapping exists
 * - keep legacy-compatible IDs that are still used by existing setups
 */

export const IMPLEMENTED_CLI_FINGERPRINT_PROVIDER_IDS = [
  "codex",
  "github",
  "antigravity",
  "gemini-cli",
] as const;

export const CLI_COMPAT_DISPLAY_PROVIDER_IDS = [
  "codex",
  "copilot",
  "antigravity",
  "gemini-cli",
] as const;

const TOOL_ID_TO_PROVIDER_ID: Record<string, string> = {
  kilo: "kilocode",
  copilot: "github",
};

export const CLI_COMPAT_PROVIDER_DISPLAY: Record<string, { name: string; description: string }> = {
  codex: {
    name: "Codex",
    description: "OpenAI Codex CLI compatibility",
  },
  copilot: {
    name: "Copilot",
    description: "GitHub Copilot compatibility",
  },
  antigravity: {
    name: "Antigravity",
    description: "Google Antigravity IDE compatibility",
  },
  "gemini-cli": {
    name: "Gemini CLI",
    description: "Google Gemini CLI compatibility",
  },
};

const DERIVED_PROVIDER_IDS = Object.values(CLI_TOOLS)
  .map(
    (tool: Record<string, unknown>) => TOOL_ID_TO_PROVIDER_ID[String(tool.id)] ?? String(tool.id)
  )
  .filter((providerId) => providerId !== "continue");

const LEGACY_PROVIDER_IDS = ["copilot", "kimi-coding"];

export const CLI_COMPAT_PROVIDER_IDS = Array.from(
  new Set([...DERIVED_PROVIDER_IDS, ...LEGACY_PROVIDER_IDS])
);
