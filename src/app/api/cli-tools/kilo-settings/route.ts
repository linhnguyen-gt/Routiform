"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  ensureCliConfigWriteAllowed,
  getCliConfigHome,
  getCliRuntimeStatus,
} from "@/shared/services/cliRuntime";
import { createBackup } from "@/shared/services/backupService";
import { saveCliToolLastConfigured, deleteCliToolLastConfigured } from "@/lib/db/cliToolState";
import { cliModelConfigSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getApiKeyById } from "@/lib/localDb";

const getKiloDataDir = () => path.join(getCliConfigHome(), ".local", "share", "kilo");
const getAuthPath = () => path.join(getKiloDataDir(), "auth.json");
const getVsCodeSettingsPath = () =>
  path.join(getCliConfigHome(), ".config", "Code", "User", "settings.json");

// Read auth.json
const readAuth = async () => {
  try {
    const content = await fs.readFile(getAuthPath(), "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if Routiform OpenAI-compatible provider is configured
const hasRoutiformConfig = (auth) => {
  if (!auth) return false;
  const routerEntry = auth["openai-compatible"] || auth["routiform"];
  if (!routerEntry) return false;
  const baseUrl = routerEntry.baseUrl || routerEntry.baseURL || "";
  return (
    baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("routiform")
  );
};

// GET - Check kilo CLI and read current settings
export async function GET() {
  try {
    const runtime = await getCliRuntimeStatus("kilo");

    if (!runtime.installed) {
      return NextResponse.json({
        installed: runtime.installed,
        runnable: runtime.runnable,
        command: runtime.command,
        commandPath: runtime.commandPath,
        runtimeMode: runtime.runtimeMode,
        reason: runtime.reason,
        settings: null,
        message: "Kilo Code CLI is not installed",
      });
    }

    const auth = await readAuth();
    const authPath = getAuthPath();
    const vscodeSettingsPath = getVsCodeSettingsPath();

    // Read kilo VS Code extension settings if available
    let extensionSettings = null;
    try {
      const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
      const allSettings = JSON.parse(raw);
      // Extract kilo-related settings
      extensionSettings = {};
      for (const [key, value] of Object.entries(allSettings)) {
        if (
          key.startsWith("kilocode.") ||
          key.startsWith("kilo-code.") ||
          key.startsWith("kilo.")
        ) {
          extensionSettings[key] = value;
        }
      }
    } catch {
      /* VS Code settings not available */
    }

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings: {
        auth: auth ? Object.keys(auth) : [],
        extensionSettings,
      },
      hasRoutiform: hasRoutiformConfig(auth),
      authPath,
      message: runtime.runnable
        ? "Kilo Code CLI is installed and runnable"
        : "Kilo config detected, but the CLI is not runnable in this environment",
    });
  } catch (error) {
    console.log("Error checking kilo settings:", error);
    return NextResponse.json({ error: "Failed to check kilo settings" }, { status: 500 });
  }
}

// POST - Configure Kilo Code to use Routiform as OpenAI-compatible provider
export async function POST(request) {
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

    const validation = validateBody(cliModelConfigSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { baseUrl, model } = validation.data;
    let { apiKey } = validation.data;

    // (#549) Resolve real key from DB if keyId was provided.
    const keyId = typeof rawBody?.keyId === "string" ? rawBody.keyId.trim() : null;
    if (keyId) {
      try {
        const keyRecord = await getApiKeyById(keyId);
        if (keyRecord?.key) {
          apiKey = keyRecord.key as string;
        }
      } catch {
        // Non-critical: fall back to whatever value was in apiKey
      }
    }

    const kiloDataDir = getKiloDataDir();
    const authPath = getAuthPath();

    // Ensure directories exist
    await fs.mkdir(kiloDataDir, { recursive: true });

    // Backup auth before modifying
    await createBackup("kilo", authPath);

    // Read existing auth
    let auth = {};
    try {
      const existing = await fs.readFile(authPath, "utf-8");
      auth = JSON.parse(existing);
    } catch {
      /* No existing auth */
    }

    // Normalize baseUrl
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

    // Add/update Routiform as openai-compatible provider
    auth["openai-compatible"] = {
      type: "api-key",
      apiKey: apiKey || "sk_routiform",
      baseUrl: normalizedBaseUrl,
      model: model,
    };

    await fs.writeFile(authPath, JSON.stringify(auth, null, 2));

    // Also try to update VS Code extension settings if available
    try {
      const vscodeSettingsPath = getVsCodeSettingsPath();
      let vscodeSettings = {};
      try {
        const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
        vscodeSettings = JSON.parse(raw);
      } catch {
        /* no existing settings */
      }

      // Set custom provider config for the extension
      vscodeSettings["kilocode.customProvider"] = {
        name: "Routiform",
        baseURL: normalizedBaseUrl,
        apiKey: apiKey || "sk_routiform",
      };
      vscodeSettings["kilocode.defaultModel"] = model;

      await fs.writeFile(vscodeSettingsPath, JSON.stringify(vscodeSettings, null, 2));
    } catch {
      // VS Code settings not writable — not a problem for CLI
    }

    // Persist last-configured timestamp
    try {
      saveCliToolLastConfigured("kilo");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Kilo Code settings applied successfully!",
      authPath,
    });
  } catch (error) {
    console.log("Error updating kilo settings:", error);
    return NextResponse.json({ error: "Failed to update kilo settings" }, { status: 500 });
  }
}

// DELETE - Remove Routiform config from Kilo
export async function DELETE() {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const authPath = getAuthPath();

    // Backup before reset
    await createBackup("kilo", authPath);

    // Read existing auth
    let auth = {};
    try {
      const existing = await fs.readFile(authPath, "utf-8");
      auth = JSON.parse(existing);
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No settings file to reset" });
      }
      throw error;
    }

    // Remove Routiform provider
    delete auth["openai-compatible"];
    delete auth["routiform"];

    await fs.writeFile(authPath, JSON.stringify(auth, null, 2));

    // Also clean up VS Code extension settings
    try {
      const vscodeSettingsPath = getVsCodeSettingsPath();
      const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
      const vscodeSettings = JSON.parse(raw);
      delete vscodeSettings["kilocode.customProvider"];
      delete vscodeSettings["kilocode.defaultModel"];
      await fs.writeFile(vscodeSettingsPath, JSON.stringify(vscodeSettings, null, 2));
    } catch {
      /* ignore */
    }

    // Clear last-configured timestamp
    try {
      deleteCliToolLastConfigured("kilo");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Routiform settings removed from Kilo Code",
    });
  } catch (error) {
    console.log("Error resetting kilo settings:", error);
    return NextResponse.json({ error: "Failed to reset kilo settings" }, { status: 500 });
  }
}
