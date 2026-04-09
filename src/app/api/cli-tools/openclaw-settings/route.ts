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
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getApiKeyById } from "@/lib/localDb";
import { z } from "zod";

const getOpenClawSettingsPath = () => getCliPrimaryConfigPath("openclaw");
const getOpenClawDir = () => path.dirname(getOpenClawSettingsPath());
const openClawSettingsSchema = z
  .object({
    baseUrl: z.string().trim().min(1, "baseUrl and model are required"),
    apiKey: z.string().optional(),
    model: z.string().trim().min(1, "baseUrl and model are required").optional(),
    models: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.model && (!Array.isArray(value.models) || value.models.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one model is required",
        path: ["models"],
      });
    }
  });

// Read current settings.json
const readSettings = async () => {
  try {
    const settingsPath = getOpenClawSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if settings has Routiform config (legacy `routiform` key still counts)
const hasRoutiformConfig = (settings: any) => {
  if (!settings || !settings.models || !settings.models.providers) return false;
  const p = settings.models.providers;
  return !!(p["routiform"] || p["routiform"]);
};

// GET - Check openclaw CLI and read current settings
export async function GET() {
  try {
    const runtime = await getCliRuntimeStatus("openclaw");

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
            ? "Open Claw CLI is installed but not runnable"
            : "Open Claw CLI is not installed",
      });
    }

    const settings = await readSettings();

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings,
      hasRoutiform: hasRoutiformConfig(settings),
      settingsPath: getOpenClawSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking openclaw settings:", error);
    return NextResponse.json({ error: "Failed to check openclaw settings" }, { status: 500 });
  }
}

// POST - Update Routiform settings (merge with existing settings)
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

    const validation = validateBody(openClawSettingsSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    let { baseUrl, apiKey, model, models } = validation.data;

    const normalizedModels = Array.from(
      new Set(
        (Array.isArray(models) ? models : [])
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      )
    );
    if (normalizedModels.length === 0 && typeof model === "string" && model.trim()) {
      normalizedModels.push(model.trim());
    }
    if (normalizedModels.length === 0) {
      return NextResponse.json({ error: "At least one model is required" }, { status: 400 });
    }
    model = normalizedModels[0];

    // (#526) Resolve real key from DB if keyId was provided
    const keyId = typeof rawBody?.keyId === "string" ? rawBody.keyId.trim() : null;
    if (keyId) {
      try {
        const keyRecord = await getApiKeyById(keyId);
        if (keyRecord?.key) apiKey = keyRecord.key as string;
      } catch {
        /* non-critical */
      }
    }

    const openclawDir = getOpenClawDir();
    const settingsPath = getOpenClawSettingsPath();

    // Ensure directory exists
    await fs.mkdir(openclawDir, { recursive: true });

    // Backup current settings before modifying
    await createBackup("openclaw", settingsPath);

    // Read existing settings or create new
    let settings: Record<string, any> = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings);
    } catch {
      /* No existing settings */
    }

    // Ensure structure exists
    if (!settings.agents) settings.agents = {};
    if (!settings.agents.defaults) settings.agents.defaults = {};
    if (!settings.agents.defaults.model) settings.agents.defaults.model = {};
    if (!settings.models) settings.models = {};
    if (!settings.models.providers) settings.models.providers = {};

    // Normalize baseUrl to ensure /v1 suffix
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

    // Update agents.defaults.model.primary
    settings.agents.defaults.model.primary = `routiform/${model}`;

    // Update models.providers.routiform
    delete settings.models.providers["routiform"];
    settings.models.providers["routiform"] = {
      baseUrl: normalizedBaseUrl,
      apiKey: apiKey || "your_api_key",
      api: "openai-completions",
      models: normalizedModels.map((modelId) => ({
        id: modelId,
        name: modelId.split("/").pop() || modelId,
      })),
    };

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    // Persist last-configured timestamp
    try {
      saveCliToolLastConfigured("openclaw");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Open Claw settings applied successfully!",
      settingsPath,
    });
  } catch (error) {
    console.log("Error updating openclaw settings:", error);
    return NextResponse.json({ error: "Failed to update openclaw settings" }, { status: 500 });
  }
}

// DELETE - Remove Routiform settings only (keep other settings)
export async function DELETE() {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const settingsPath = getOpenClawSettingsPath();

    // Backup current settings before resetting
    await createBackup("openclaw", settingsPath);

    // Read existing settings
    let settings: Record<string, any> = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No settings file to reset",
        });
      }
      throw error;
    }

    // Remove Routiform from models.providers
    if (settings.models && settings.models.providers) {
      delete settings.models.providers["routiform"];
      delete settings.models.providers["routiform"];

      // Remove providers object if empty
      if (Object.keys(settings.models.providers).length === 0) {
        delete settings.models.providers;
      }
    }

    // Reset agents.defaults.model.primary if it uses routiform or legacy routiform
    const primary = settings.agents?.defaults?.model?.primary;
    if (
      typeof primary === "string" &&
      (primary.startsWith("routiform/") || primary.startsWith("routiform/"))
    ) {
      delete settings.agents.defaults.model.primary;
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    // Clear last-configured timestamp
    try {
      deleteCliToolLastConfigured("openclaw");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Routiform settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting openclaw settings:", error);
    return NextResponse.json({ error: "Failed to reset openclaw settings" }, { status: 500 });
  }
}
