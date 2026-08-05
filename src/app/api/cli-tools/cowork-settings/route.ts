"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getApiKeyById } from "@/lib/localDb";
import { coworkSettingsSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

const PROVIDER = "gateway";

const getCandidateRoots = () => {
  if (os.platform() === "darwin") {
    const base = path.join(os.homedir(), "Library", "Application Support");
    return [path.join(base, "Claude-3p"), path.join(base, "Claude")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return [
      path.join(localApp, "Claude-3p"),
      path.join(roaming, "Claude-3p"),
      path.join(localApp, "Claude"),
      path.join(roaming, "Claude"),
    ];
  }
  return [
    path.join(os.homedir(), ".config", "Claude-3p"),
    path.join(os.homedir(), ".config", "Claude"),
  ];
};

const getAppInstallPaths = () => {
  if (os.platform() === "darwin") {
    return ["/Applications/Claude.app", path.join(os.homedir(), "Applications", "Claude.app")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    return [
      path.join(localApp, "AnthropicClaude"),
      path.join(programFiles, "Claude"),
      path.join(programFiles, "AnthropicClaude"),
    ];
  }
  return [];
};

const resolveAppRootForRead = async () => {
  const candidates = getCandidateRoots();
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, "configLibrary"));
      return dir;
    } catch {
      /* try next */
    }
  }
  return candidates[0];
};

const getWriteRoot = () => getCandidateRoots()[0];

const getConfigDir = async () => path.join(await resolveAppRootForRead(), "configLibrary");
const getWriteConfigDir = () => path.join(getWriteRoot(), "configLibrary");
const getMetaPath = async () => path.join(await getConfigDir(), "_meta.json");
const getWriteMetaPath = () => path.join(getWriteConfigDir(), "_meta.json");

const get1pRoot = () => {
  if (os.platform() === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude");
  }
  if (os.platform() === "win32") {
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(roaming, "Claude");
  }
  return path.join(os.homedir(), ".config", "Claude");
};

const bootstrapDeploymentMode = async () => {
  const cfgPath = path.join(get1pRoot(), "claude_desktop_config.json");
  let cfg: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(cfgPath, "utf-8");
    cfg = JSON.parse(content);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  if (cfg.deploymentMode === "3p") return false;
  cfg.deploymentMode = "3p";
  await fs.mkdir(get1pRoot(), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  return true;
};

const checkInstalled = async () => {
  for (const dir of [...getCandidateRoots(), ...getAppInstallPaths()]) {
    try {
      await fs.access(dir);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
};

const isLocalhostUrl = (url: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url || "");

const readJson = async (filePath: string): Promise<Record<string, unknown> | null> => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
};

const ensureMeta = async () => {
  const writeMetaPath = getWriteMetaPath();
  let meta = await readJson(writeMetaPath);
  if (!meta || !meta.appliedId) {
    const existingRead = await readJson(await getMetaPath());
    if (existingRead?.appliedId) {
      meta = existingRead;
    } else {
      const newId = crypto.randomUUID();
      meta = { appliedId: newId, entries: [{ id: newId, name: "Default" }] };
    }
    await fs.mkdir(getWriteConfigDir(), { recursive: true });
    await fs.writeFile(writeMetaPath, JSON.stringify(meta, null, 2));
  }
  return meta;
};

export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installed = await checkInstalled();
    if (!installed) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Claude Desktop (Cowork mode) not detected",
      });
    }

    const meta = await readJson(await getMetaPath());
    const appliedId = meta?.appliedId || null;
    const configDir = await getConfigDir();
    const configPath = appliedId ? path.join(configDir, `${appliedId}.json`) : null;
    const config = configPath ? await readJson(configPath) : null;

    const baseUrl = (config?.inferenceGatewayBaseUrl as string) || null;
    const models = Array.isArray(config?.inferenceModels)
      ? (config.inferenceModels as Array<Record<string, unknown>>)
          .map((m) => (typeof m === "string" ? m : m?.name))
          .filter((m): m is string => Boolean(m))
      : [];

    const hasRoutiform = !!(config?.inferenceProvider === PROVIDER && baseUrl);

    return NextResponse.json({
      installed: true,
      config,
      hasRoutiform,
      configPath,
      cowork: {
        appliedId,
        baseUrl,
        models,
        provider: config?.inferenceProvider || null,
      },
    });
  } catch (error) {
    console.log("Error reading cowork settings:", error);
    return NextResponse.json({ error: "Failed to read cowork settings" }, { status: 500 });
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
    const validation = validateBody(coworkSettingsSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { baseUrl, apiKey, models, keyId } = validation.data;

    let resolvedApiKey = apiKey || null;

    if (keyId && !resolvedApiKey) {
      try {
        const keyRecord = await getApiKeyById(keyId);
        if (keyRecord?.key) {
          resolvedApiKey = keyRecord.key as string;
        }
      } catch {
        // Non-critical: fall back to apiKey if provided
      }
    }

    if (!baseUrl || !resolvedApiKey) {
      return NextResponse.json({ error: "baseUrl and apiKey are required" }, { status: 400 });
    }

    if (isLocalhostUrl(baseUrl)) {
      return NextResponse.json(
        {
          error:
            "Claude Cowork sandbox cannot reach localhost. Enable Tunnel/Cloud Endpoint or use Tailscale/VPS.",
        },
        { status: 400 }
      );
    }

    const modelsArray = Array.isArray(models)
      ? models.filter((m) => typeof m === "string" && m.trim())
      : [];
    if (modelsArray.length === 0) {
      return NextResponse.json({ error: "At least one model is required" }, { status: 400 });
    }

    const bootstrapped = await bootstrapDeploymentMode();
    const meta = await ensureMeta();
    const configPath = path.join(getWriteConfigDir(), `${meta.appliedId}.json`);

    const newConfig = {
      inferenceProvider: PROVIDER,
      inferenceGatewayBaseUrl: baseUrl,
      inferenceGatewayApiKey: resolvedApiKey,
      inferenceModels: modelsArray.map((name) => ({ name })),
    };

    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

    return NextResponse.json({
      success: true,
      bootstrapped,
      message: bootstrapped
        ? "Cowork enabled (3p mode set). Quit & reopen Claude Desktop."
        : "Cowork settings applied. Quit & reopen Claude Desktop.",
      configPath,
    });
  } catch (error) {
    console.log("Error applying cowork settings:", error);
    return NextResponse.json({ error: "Failed to apply cowork settings" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meta = await readJson(await getMetaPath());
    if (!meta?.appliedId) {
      return NextResponse.json({ success: true, message: "No active config to reset" });
    }
    const configPath = path.join(await getConfigDir(), `${meta.appliedId}.json`);
    try {
      await fs.writeFile(configPath, JSON.stringify({}, null, 2));
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    return NextResponse.json({ success: true, message: "Cowork config reset" });
  } catch (error) {
    console.log("Error resetting cowork settings:", error);
    return NextResponse.json({ error: "Failed to reset cowork settings" }, { status: 500 });
  }
}
