"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  ensureCliConfigWriteAllowed,
  getCliRuntimeStatus,
  resolveKiloPaths,
} from "@/shared/services/cliRuntime";
import { createMultiBackup } from "@/shared/services/backupService";
import { saveCliToolLastConfigured, deleteCliToolLastConfigured } from "@/lib/db/cliToolState";
import {
  applyRoutiformKiloAuth,
  applyRoutiformKiloConfig,
  hasRoutiformKiloConfig,
  removeRoutiformKiloAuth,
  removeRoutiformKiloConfig,
  toKiloLimits,
} from "@/shared/services/kiloConfig";
import { fetchModelTokenLimits } from "@/shared/services/modelTokenLimits";
import { cliModelConfigSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { getApiKeyById } from "@/lib/localDb";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

const getConfigPath = () => resolveKiloPaths().config;
const getAuthPath = () => resolveKiloPaths().auth;

const readJsonFile = async (filePath: string) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // A hand-edited file that no longer parses must not be silently replaced.
    throw error;
  }
};

const writeJsonFile = async (filePath: string, value: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// GET - Check kilo CLI and read current settings
export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const config = await readJsonFile(getConfigPath()).catch(() => null);
    const auth = await readJsonFile(getAuthPath()).catch(() => null);

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings: {
        auth: auth ? Object.keys(auth) : [],
        model: config?.model ?? null,
        provider: config?.provider ? Object.keys(config.provider) : [],
      },
      hasRoutiform: hasRoutiformKiloConfig(config),
      configPath: getConfigPath(),
      authPath: getAuthPath(),
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
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const configPath = getConfigPath();
    const authPath = getAuthPath();

    await createMultiBackup("kilo", [configPath, authPath]);

    // Kilo shows context usage and caps output from `limit`, so it needs the real numbers.
    const { contextLengths, maxOutputTokens } = await fetchModelTokenLimits([model]);

    const config = applyRoutiformKiloConfig(await readJsonFile(configPath), {
      baseUrl,
      model,
      limits: toKiloLimits(contextLengths, maxOutputTokens),
    });
    await writeJsonFile(configPath, config);

    const auth = applyRoutiformKiloAuth(await readJsonFile(authPath), apiKey || "sk_routiform");
    await writeJsonFile(authPath, auth);

    // Persist last-configured timestamp
    try {
      saveCliToolLastConfigured("kilo");
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      message: "Kilo Code settings applied successfully!",
      configPath,
      authPath,
    });
  } catch (error) {
    console.log("Error updating kilo settings:", error);
    return NextResponse.json({ error: "Failed to update kilo settings" }, { status: 500 });
  }
}

// DELETE - Remove Routiform config from Kilo
export async function DELETE(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const configPath = getConfigPath();
    const authPath = getAuthPath();

    const existingConfig = await readJsonFile(configPath);
    const existingAuth = await readJsonFile(authPath);
    if (existingConfig === null && existingAuth === null) {
      return NextResponse.json({ success: true, message: "No settings file to reset" });
    }

    await createMultiBackup("kilo", [configPath, authPath]);

    if (existingConfig !== null) {
      await writeJsonFile(configPath, removeRoutiformKiloConfig(existingConfig));
    }
    if (existingAuth !== null) {
      await writeJsonFile(authPath, removeRoutiformKiloAuth(existingAuth));
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
