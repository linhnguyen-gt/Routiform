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

const getClineDataDir = () => path.join(getCliConfigHome(), ".cline", "data");
const getGlobalStatePath = () => path.join(getClineDataDir(), "globalState.json");
const getSecretsPath = () => path.join(getClineDataDir(), "secrets.json");

// Read globalState.json
const readGlobalState = async () => {
  try {
    const content = await fs.readFile(getGlobalStatePath(), "utf-8");
    return JSON.parse(content);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
};

// Read secrets.json
const readSecrets = async () => {
  try {
    const content = await fs.readFile(getSecretsPath(), "utf-8");
    return JSON.parse(content);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
};

// Check if Routiform is configured as OpenAI-compatible provider
const hasRoutiformConfig = (globalState: Record<string, unknown>) => {
  if (!globalState) return false;
  const isOpenAi =
    globalState.actModeApiProvider === "openai" || globalState.planModeApiProvider === "openai";
  const baseUrl = globalState.openAiBaseUrl || "";
  const baseUrlStr = String(baseUrl);
  return (
    isOpenAi &&
    (baseUrlStr.includes("localhost") ||
      baseUrlStr.includes("127.0.0.1") ||
      baseUrlStr.includes("routiform"))
  );
};

// GET - Check cline CLI and read current settings
export async function GET() {
  try {
    const runtime = await getCliRuntimeStatus("cline");

    if (!runtime.installed) {
      return NextResponse.json({
        installed: runtime.installed,
        runnable: runtime.runnable,
        command: runtime.command,
        commandPath: runtime.commandPath,
        runtimeMode: runtime.runtimeMode,
        reason: runtime.reason,
        settings: null,
        message: "Cline CLI is not installed",
      });
    }

    const globalState = await readGlobalState();
    const _secrets = await readSecrets();
    const globalStatePath = getGlobalStatePath();
    const secretsPath = getSecretsPath();

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings: {
        actModeApiProvider: globalState?.actModeApiProvider,
        planModeApiProvider: globalState?.planModeApiProvider,
        openAiBaseUrl: globalState?.openAiBaseUrl,
        openAiModelId: globalState?.openAiModelId,
        planModeOpenAiModelId: globalState?.planModeOpenAiModelId,
      },
      hasRoutiform: hasRoutiformConfig(globalState),
      globalStatePath,
      secretsPath,
      message: runtime.runnable
        ? "Cline CLI is installed and runnable"
        : "Cline config detected, but the CLI is not runnable in this environment",
    });
  } catch (error) {
    console.log("Error checking cline settings:", error);
    return NextResponse.json({ error: "Failed to check cline settings" }, { status: 500 });
  }
}

// POST - Configure Cline to use Routiform as OpenAI-compatible provider
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

    const validation = validateBody(cliModelConfigSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    let { baseUrl, apiKey, model } = validation.data;

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

    const clineDataDir = getClineDataDir();
    const globalStatePath = getGlobalStatePath();
    const secretsPath = getSecretsPath();

    // Ensure directory exists
    await fs.mkdir(clineDataDir, { recursive: true });

    // Backup current files before modifying
    await createBackup("cline", globalStatePath);
    await createBackup("cline", secretsPath);

    // Read existing globalState or create new
    let globalState: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(globalStatePath, "utf-8");
      globalState = JSON.parse(existing);
    } catch {
      /* No existing config */
    }

    // Normalize baseUrl - Cline expects the base without /v1
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;

    // Set OpenAI-compatible provider for both act and plan modes
    globalState.actModeApiProvider = "openai";
    globalState.planModeApiProvider = "openai";
    globalState.openAiBaseUrl = normalizedBaseUrl;
    globalState.openAiModelId = model;
    globalState.planModeOpenAiModelId = model;

    // Write globalState
    await fs.writeFile(globalStatePath, JSON.stringify(globalState, null, 2));

    // Write API key to secrets
    let secrets: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(secretsPath, "utf-8");
      secrets = JSON.parse(existing);
    } catch {
      /* No existing secrets */
    }

    secrets.openAiApiKey = apiKey || "sk_routiform";

    await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));

    // Persist last-configured timestamp
    try {
      saveCliToolLastConfigured("cline");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Cline settings applied successfully!",
      globalStatePath,
    });
  } catch (error) {
    console.log("Error updating cline settings:", error);
    return NextResponse.json({ error: "Failed to update cline settings" }, { status: 500 });
  }
}

// DELETE - Remove Routiform OpenAI-compatible provider config
export async function DELETE() {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const globalStatePath = getGlobalStatePath();
    const secretsPath = getSecretsPath();

    // Backup before reset
    await createBackup("cline", globalStatePath);
    await createBackup("cline", secretsPath);

    // Read existing state
    let globalState: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(globalStatePath, "utf-8");
      globalState = JSON.parse(existing);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No settings file to reset" });
      }
      throw error;
    }

    // Only reset if currently set to openai mode with our config
    if (globalState.actModeApiProvider === "openai") {
      delete globalState.openAiBaseUrl;
      delete globalState.openAiModelId;
      delete globalState.planModeOpenAiModelId;
      // Reset provider to default (cline)
      globalState.actModeApiProvider = "cline";
      globalState.planModeApiProvider = "cline";
    }

    await fs.writeFile(globalStatePath, JSON.stringify(globalState, null, 2));

    // Remove API key from secrets
    let secrets: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(secretsPath, "utf-8");
      secrets = JSON.parse(existing);
    } catch {
      /* ignore */
    }

    delete secrets.openAiApiKey;
    await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));

    // Clear last-configured timestamp
    try {
      deleteCliToolLastConfigured("cline");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Routiform settings removed from Cline",
    });
  } catch (error) {
    console.log("Error resetting cline settings:", error);
    return NextResponse.json({ error: "Failed to reset cline settings" }, { status: 500 });
  }
}
