"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import {
  getCliRuntimeStatus,
  CLI_TOOL_IDS,
  getCliPrimaryConfigPath,
  resolveOmpWritePaths,
} from "@/shared/services/cliRuntime";
import { getClaudeCliConfigStatus } from "@/shared/services/claudeCodeConfig";
import { hasRoutiformCodexConfig, hasUsableCodexAuth } from "@/shared/services/codexConfigToml";
import { hasRoutiformHermesConfig } from "@/shared/services/hermesConfigYaml";
import { hasRoutiformGrokConfig } from "@/shared/services/grokConfigToml";
import { hasRoutiformKimiConfig } from "@/shared/services/kimiConfigToml";
import { hasRoutiformOmpConfig } from "@/shared/services/ompConfig";
import { load as loadYaml } from "js-yaml";
import { getAllCliToolLastConfigured } from "@/lib/db/cliToolState";
import { getRuntimePorts } from "@/lib/runtime/ports";

const { apiPort } = getRuntimePorts();

// Check if a tool has Routiform configured by reading its config file directly
// This replaces the expensive self-referential HTTP calls to /api/cli-tools/*-settings
async function checkToolConfigStatus(toolId: string): Promise<string> {
  try {
    // omp accepts both a .yml and a .yaml spelling and loads whichever exists first, so
    // the file it actually reads has to be resolved rather than assumed.
    if (toolId === "omp") {
      const { models } = await resolveOmpWritePaths();
      const raw = await fs.readFile(models, "utf-8");
      return hasRoutiformOmpConfig(raw.trim() ? loadYaml(raw) : {})
        ? "configured"
        : "not_configured";
    }

    const configPath = getCliPrimaryConfigPath(toolId);
    if (!configPath) return "unknown";

    const content = await fs.readFile(configPath, "utf-8");

    // Codex uses TOML config — parse as raw text, not JSON
    if (toolId === "codex") {
      if (!hasRoutiformCodexConfig(content)) return "not_configured";

      try {
        const authPath = configPath.replace(/config\.toml$/, "auth.json");
        const authContent = await fs.readFile(authPath, "utf-8");
        if (!hasUsableCodexAuth(authContent)) {
          return "not_configured";
        }
      } catch {
        return "not_configured";
      }

      return "configured";
    }

    // Kimi Code also uses TOML, and only the provider block proves Routiform is wired in —
    // default_model alone can name a model the user picked from somebody else's provider.
    if (toolId === "kimi") {
      return hasRoutiformKimiConfig(content) ? "configured" : "not_configured";
    }

    // Grok Build is TOML too, and only a managed [model."routiform/…"] entry proves the
    // wiring — the [models] default alone can name a model from somebody else's provider.
    if (toolId === "grok") {
      return hasRoutiformGrokConfig(content) ? "configured" : "not_configured";
    }

    // Hermes stores its config as YAML, so it never reaches the JSON branch below
    if (toolId === "hermes") {
      return hasRoutiformHermesConfig(content) ? "configured" : "not_configured";
    }

    // omp is handled before this point — it has two spellings of its models file, so the
    // path this function read may not be the one omp loads.

    const config = JSON.parse(content);

    // Each tool stores Routiform config differently
    switch (toolId) {
      case "claude":
        return getClaudeCliConfigStatus(config?.env, {
          cloudUrl: process.env.NEXT_PUBLIC_CLOUD_URL,
        });
      case "droid":
      case "openclaw":
      case "cline":
      case "kilo": {
        // Generic check: look for Routiform-specific markers in the config
        const configStr = JSON.stringify(config).toLowerCase();
        if (
          configStr.includes("routiform") ||
          configStr.includes("sk_routiform") ||
          configStr.includes(`localhost:${apiPort}`) ||
          configStr.includes(`127.0.0.1:${apiPort}`)
        ) {
          return "configured";
        }
        // Also accept openai-compatible provider with any non-empty baseUrl
        // (user may configure an external domain instead of localhost)
        if (
          toolId === "cline" &&
          (config.actModeApiProvider === "openai" || config.planModeApiProvider === "openai") &&
          (config.openAiBaseUrl || "").trim().length > 0
        ) {
          return "configured";
        }
        return "not_configured";
      }
      default:
        return "unknown";
    }
  } catch {
    return "not_configured";
  }
}

/**
 * GET /api/cli-tools/status
 * Returns runtime + config status for all CLI tools in one batch call.
 * Used by the CLI Tools page to show status badges in collapsed state.
 */
export async function GET() {
  try {
    const statuses = {};

    // Run all runtime checks in parallel with individual timeouts
    const RUNTIME_CHECK_TIMEOUT = 5000; // 5s per tool max
    await Promise.all(
      CLI_TOOL_IDS.map(async (toolId) => {
        try {
          const runtime = (await Promise.race([
            getCliRuntimeStatus(toolId),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), RUNTIME_CHECK_TIMEOUT)
            ),
          ])) as {
            installed: boolean;
            runnable: boolean;
            command?: string;
            commandPath?: string;
            reason?: string;
          };
          statuses[toolId] = {
            installed: runtime.installed,
            runnable: runtime.runnable,
            command: runtime.command,
            commandPath: runtime.commandPath,
            reason: runtime.reason || null,
          };
        } catch (error) {
          statuses[toolId] = {
            installed: false,
            runnable: false,
            reason: error.message || "Check failed",
          };
        }
      })
    );

    // Check config status for installed+runnable tools via direct file reads
    const settingsTools = [
      "claude",
      "codex",
      "droid",
      "openclaw",
      "cline",
      "kilo",
      "hermes",
      "omp",
      "kimi",
      "grok",
    ];

    await Promise.all(
      settingsTools.map(async (toolId) => {
        if (!statuses[toolId]) {
          return;
        }
        if (!statuses[toolId].installed) {
          statuses[toolId].configStatus = "not_installed";
          return;
        }
        statuses[toolId].configStatus = await checkToolConfigStatus(toolId);
      })
    );

    // Merge last-configured timestamps from SQLite
    try {
      const lastConfigured = getAllCliToolLastConfigured();
      for (const [toolId, timestamp] of Object.entries(lastConfigured)) {
        if (statuses[toolId]) {
          statuses[toolId].lastConfiguredAt = timestamp;
        }
      }
    } catch {
      /* non-critical */
    }

    return NextResponse.json(statuses);
  } catch (error) {
    console.log("Error fetching CLI tool statuses:", error);
    return NextResponse.json({ error: "Failed to fetch statuses" }, { status: 500 });
  }
}
