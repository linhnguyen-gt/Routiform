import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { getCliConfigHome, getOpenCodeConfigPath } from "@/shared/services/cliRuntime";
import { mergeOpenCodeConfig } from "@/shared/services/opencodeConfig";
import { applyRoutiformContinueConfig } from "@/shared/services/continueConfig";
import { fetchModelTokenLimits } from "@/shared/services/modelTokenLimits";
import {
  guideSettingsSaveSchema,
  opencodeGuideSettingsSaveSchema,
} from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

/**
 * POST /api/cli-tools/guide-settings/:toolId
 *
 * Save configuration for guide-based tools that have config files.
 * Currently supports: continue, opencode
 */
export async function POST(request, { params }) {
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

  const { toolId } = await params;
  const schema = toolId === "opencode" ? opencodeGuideSettingsSaveSchema : guideSettingsSaveSchema;
  const validation = validateBody(schema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { baseUrl, apiKey, model } = validation.data;
  const models =
    toolId === "opencode" && Array.isArray((validation.data as { models?: string[] }).models)
      ? (validation.data as { models?: string[] }).models
      : undefined;

  try {
    switch (toolId) {
      case "continue":
        return await saveContinueConfig({ baseUrl, apiKey, model });
      case "opencode":
        // OpenCode reads opencode.json (see getOpenCodeConfigPath); merge the managed
        // Routiform OpenAI/Anthropic provider entries without touching unrelated providers.
        return await saveOpenCodeConfig({ baseUrl, apiKey, model, models });
      default:
        return NextResponse.json(
          { error: `Direct config save not supported for: ${toolId}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * Save Continue config to ~/.continue/config.yaml, merging with what is already there.
 *
 * config.json is deprecated in favour of config.yaml, so a legacy JSON file is read for
 * its models but is never written back to — the YAML file becomes the one Continue loads.
 */
async function saveContinueConfig({ baseUrl, apiKey, model }) {
  const { apiPort } = getRuntimePorts();
  const continueDir = path.join(getCliConfigHome(), ".continue");
  const configPath = path.join(continueDir, "config.yaml");
  const legacyConfigPath = path.join(continueDir, "config.json");

  await fs.mkdir(continueDir, { recursive: true });

  let existingConfig: unknown = {};
  try {
    existingConfig = loadYaml(await fs.readFile(configPath, "utf-8")) ?? {};
  } catch {
    // No YAML yet — carry over a legacy config.json so the migration keeps the user's models.
    try {
      existingConfig = JSON.parse(await fs.readFile(legacyConfigPath, "utf-8"));
    } catch {
      existingConfig = {};
    }
  }

  const config = applyRoutiformContinueConfig(
    existingConfig,
    { baseUrl, apiKey, model },
    { localHosts: [`localhost:${apiPort}`, `127.0.0.1:${apiPort}`] }
  );

  await fs.writeFile(configPath, dumpYaml(config, { indent: 2, lineWidth: -1 }), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Continue config saved to ${configPath}`,
    configPath,
  });
}

/**
 * - Linux/macOS: ~/.config/opencode/opencode.json (XDG_CONFIG_HOME aware)
 * - Windows: %APPDATA%/opencode/opencode.json
 *
 * (#524) OpenCode was silently failing because this handler was missing.
 */
async function saveOpenCodeConfig({ baseUrl, apiKey, model, models }) {
  const configPath = getOpenCodeConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure config directory exists
  await fs.mkdir(configDir, { recursive: true });

  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");

  // Read existing JSON to preserve other provider entries
  let existingConfig: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    existingConfig = JSON.parse(raw);
  } catch {
    // File doesn't exist or invalid JSON — start fresh
  }

  // opencode shows % of context used and caps output, so it needs the real limits.
  const { contextLengths, maxOutputTokens } = await fetchModelTokenLimits([
    model,
    ...(models || []),
  ]);

  const nextConfig = mergeOpenCodeConfig(existingConfig, {
    baseUrl: normalizedBaseUrl,
    apiKey,
    model,
    models,
    modelContextLengths: contextLengths,
    modelMaxOutputTokens: maxOutputTokens,
  });

  await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf-8");

  return NextResponse.json({
    success: true,
    message: `OpenCode config saved to ${configPath}`,
    configPath,
  });
}
