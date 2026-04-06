"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  ensureCliConfigWriteAllowed,
  getCliPrimaryConfigPath,
  getCliRuntimeStatus,
} from "@/shared/services/cliRuntime";
import { createBackup } from "@/shared/services/backupService";
import { saveCliToolLastConfigured, deleteCliToolLastConfigured } from "@/lib/db/cliToolState";
import { cliSettingsEnvSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getApiKeyById } from "@/lib/localDb";
import { parseCliToolConfigJson } from "@/shared/utils/parseCliToolConfigJson";

// Get claude settings path based on OS
const getClaudeSettingsPath = () => getCliPrimaryConfigPath("claude");

// Read current settings (null if missing; parseError if file exists but is not valid JSON5)
const readSettings = async (): Promise<{
  data: Record<string, unknown> | null;
  parseError?: string;
}> => {
  try {
    const settingsPath = getClaudeSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    try {
      return { data: parseCliToolConfigJson(content) as Record<string, unknown> };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { data: null, parseError: msg };
    }
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { data: null };
    }
    throw error;
  }
};

// GET - Check claude CLI and read current settings
export async function GET() {
  try {
    const runtime = await getCliRuntimeStatus("claude");

    if (!runtime.installed || !runtime.runnable) {
      return NextResponse.json({
        installed: runtime.installed,
        runnable: runtime.runnable,
        command: runtime.command,
        commandPath: runtime.commandPath,
        runtimeMode: runtime.runtimeMode,
        reason: runtime.reason,
        settings: null,
        message:
          runtime.installed && !runtime.runnable
            ? "Claude CLI is installed but not runnable"
            : "Claude CLI is not installed",
      });
    }

    const { data: settings, parseError } = await readSettings();
    const env = settings?.env as Record<string, unknown> | undefined;
    const hasOmniRoute = !!env?.ANTHROPIC_BASE_URL;

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings: settings,
      settingsParseError: parseError ?? null,
      hasOmniRoute: hasOmniRoute,
      settingsPath: getClaudeSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking claude settings:", error);
    return NextResponse.json({ error: "Failed to check claude settings" }, { status: 500 });
  }
}

// POST - Backup old fields and write new settings
export async function POST(request: Request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const validation = validateBody(cliSettingsEnvSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { env } = validation.data;

    // (#523/#526) If a keyId was provided, resolve the real API key from DB.
    // The /api/keys list endpoint returns masked key strings — sending those to
    // disk would save an unusable half-hidden token. Resolving by ID guarantees
    // we always write the full key value to the config file.
    const keyId = typeof rawBody?.keyId === "string" ? rawBody.keyId.trim() : null;
    if (keyId) {
      try {
        const keyRecord = await getApiKeyById(keyId);
        if (keyRecord?.key) {
          env.ANTHROPIC_AUTH_TOKEN = keyRecord.key as string;
        }
      } catch {
        // Non-critical: fall back to whatever value was in env (e.g. sk_omniroute)
      }
    }

    const settingsPath = getClaudeSettingsPath();
    const claudeDir = path.dirname(settingsPath);

    // Ensure .claude directory exists
    await fs.mkdir(claudeDir, { recursive: true });

    // Backup current settings before modifying
    await createBackup("claude", settingsPath);

    // Read current settings (JSONC / JSON5 — same as Claude Code CLI)
    let currentSettings: Record<string, any> = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      try {
        currentSettings = parseCliToolConfigJson(content) as Record<string, any>;
      } catch {
        currentSettings = {};
      }
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }

    // Normalize ANTHROPIC_BASE_URL to ensure /v1 suffix
    if (env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL.endsWith("/v1")
        ? env.ANTHROPIC_BASE_URL
        : `${env.ANTHROPIC_BASE_URL}/v1`;
    }

    // Merge new env with existing settings
    const newSettings = {
      ...currentSettings,
      env: {
        ...(currentSettings.env || {}),
        ...env,
      },
    };

    // Write new settings
    await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2));

    // Persist last-configured timestamp
    try {
      saveCliToolLastConfigured("claude");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.log("Error updating claude settings:", error);
    return NextResponse.json({ error: "Failed to update claude settings" }, { status: 500 });
  }
}

// Fields to remove when resetting
const RESET_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "API_TIMEOUT_MS",
];

// DELETE - Reset settings (remove env fields)
export async function DELETE() {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const settingsPath = getClaudeSettingsPath();

    // Read current settings
    let currentSettings: Record<string, any> = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      try {
        currentSettings = parseCliToolConfigJson(content) as Record<string, any>;
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        return NextResponse.json(
          {
            error: "Settings file exists but could not be parsed. Fix or remove it manually.",
            details: msg,
          },
          { status: 400 }
        );
      }
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No settings file to reset",
        });
      }
      throw error;
    }

    // Backup current settings before resetting
    await createBackup("claude", settingsPath);

    // Remove specified env fields
    if (currentSettings.env) {
      RESET_ENV_KEYS.forEach((key) => {
        delete currentSettings.env[key];
      });

      // Clean up empty env object
      if (Object.keys(currentSettings.env).length === 0) {
        delete currentSettings.env;
      }
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(currentSettings, null, 2));

    // Clear last-configured timestamp
    try {
      deleteCliToolLastConfigured("claude");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Settings reset successfully",
    });
  } catch (error) {
    console.log("Error resetting claude settings:", error);
    return NextResponse.json({ error: "Failed to reset claude settings" }, { status: 500 });
  }
}
