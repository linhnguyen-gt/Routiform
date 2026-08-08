"use server";

import { NextResponse } from "next/server";
import { promisify } from "util";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  HERMES_API_KEY_ENV,
  buildModelBlock,
  parseModelBlock,
  parseTitleGeneration,
  removeAuxiliaryOverrides,
  removeModelBlock,
  upsertModelBlock,
  upsertTitleGenerationBlock,
} from "@/shared/services/hermesConfigYaml";
import { hermesSettingsSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

const execAsync = promisify(exec);

const getHermesDir = () => path.join(os.homedir(), ".hermes");
const getHermesConfigPath = () => path.join(getHermesDir(), "config.yaml");
const getHermesEnvPath = () => path.join(getHermesDir(), ".env");

const upsertEnvVar = (envText: string, key: string, value: string) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(envText)) return envText.replace(re, line);
  return envText.length > 0 && !envText.endsWith("\n")
    ? `${envText}\n${line}\n`
    : `${envText}${line}\n`;
};

const _removeEnvVar = (envText: string, key: string) => {
  const re = new RegExp(`^${key}=.*\\r?\\n?`, "m");
  return envText.replace(re, "");
};

const checkHermesInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where hermes" : "which hermes";
    await execAsync(command, { windowsHide: true } as Record<string, unknown>);
    return true;
  } catch {
    try {
      await fs.access(getHermesConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfigYaml = async () => {
  try {
    return await fs.readFile(getHermesConfigPath(), "utf-8");
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "";
    throw error;
  }
};

const readEnvFile = async () => {
  try {
    return await fs.readFile(getHermesEnvPath(), "utf-8");
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "";
    throw error;
  }
};

const hasRoutiformConfig = (modelCfg: Record<string, string | null> | null) => {
  if (!modelCfg?.base_url) return false;
  return (
    modelCfg.provider === "custom" && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(modelCfg.base_url)
  );
};

export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installed = await checkHermesInstalled();
    if (!installed) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "Hermes Agent is not installed",
      });
    }
    const yaml = await readConfigYaml();
    const model = parseModelBlock(yaml);
    return NextResponse.json({
      installed: true,
      settings: { model, titleGeneration: parseTitleGeneration(yaml) },
      hasRoutiform: hasRoutiformConfig(model),
      configPath: getHermesConfigPath(),
    });
  } catch (error) {
    console.log("Error checking hermes settings:", error);
    return NextResponse.json({ error: "Failed to check hermes settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await request.json()) as Record<string, unknown>;
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
    const validation = validateBody(hermesSettingsSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { baseUrl, apiKey, model, titleModel } = validation.data;

    const dir = getHermesDir();
    await fs.mkdir(dir, { recursive: true });

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

    const existingYaml = await readConfigYaml();
    const withModel = upsertModelBlock(existingYaml, buildModelBlock(model, normalizedBaseUrl));
    // Auxiliary tasks default to the main chat model. Routing session titles to a cheaper
    // model is the one override worth exposing, since a title is a one-line completion.
    const newYaml = upsertTitleGenerationBlock(
      withModel,
      titleModel ? { model: titleModel, baseUrl: normalizedBaseUrl } : null
    );
    await fs.writeFile(getHermesConfigPath(), newYaml);

    if (apiKey) {
      const existingEnv = await readEnvFile();
      const newEnv = upsertEnvVar(existingEnv, HERMES_API_KEY_ENV, apiKey);
      await fs.writeFile(getHermesEnvPath(), newEnv);
    }

    return NextResponse.json({
      success: true,
      message: "Hermes settings applied successfully!",
      configPath: getHermesConfigPath(),
    });
  } catch (error) {
    console.log("Error updating hermes settings:", error);
    return NextResponse.json({ error: "Failed to update hermes settings" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const configPath = getHermesConfigPath();
    let yaml = "";
    try {
      yaml = await fs.readFile(configPath, "utf-8");
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }
    const newYaml = removeAuxiliaryOverrides(removeModelBlock(yaml));
    await fs.writeFile(configPath, newYaml);
    return NextResponse.json({ success: true, message: "Routiform model block removed" });
  } catch (error) {
    console.log("Error resetting hermes settings:", error);
    return NextResponse.json({ error: "Failed to reset hermes settings" }, { status: 500 });
  }
}
