import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { getCliConfigHome, getOpenCodeConfigPath } from "@/shared/services/cliRuntime";
import {
  mergeOpenCodeConfig,
  removeRoutiformOpenCodeConfig,
} from "@/shared/services/opencodeConfig";
import {
  applyRoutiformContinueConfig,
  removeRoutiformContinueConfig,
} from "@/shared/services/continueConfig";
import {
  QWEN_API_KEY_ENV,
  applyRoutiformQwenConfig,
  removeRoutiformQwenConfig,
} from "@/shared/services/qwenConfig";
import { fetchModelTokenLimits } from "@/shared/services/modelTokenLimits";
import {
  guideSettingsSaveSchema,
  opencodeGuideSettingsSaveSchema,
} from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";
import { getApiKeyById } from "@/lib/localDb";

/**
 * POST /api/cli-tools/guide-settings/:toolId
 *
 * Save configuration for guide-based tools that have config files.
 * Currently supports: continue, opencode, qwen
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
  const { baseUrl, model } = validation.data;
  // /api/keys hands the browser a masked key, so the card sends the id and the real value is
  // read here. Writing the mask produced a config the tool could not authenticate with.
  let { apiKey } = validation.data;
  const keyId = (validation.data as { keyId?: string }).keyId?.trim();
  if (keyId) {
    try {
      const keyRecord = await getApiKeyById(keyId);
      if (keyRecord?.key) apiKey = keyRecord.key as string;
    } catch {
      // Non-critical: fall back to whatever value was in apiKey
    }
  }
  const models = Array.isArray((validation.data as { models?: string[] }).models)
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
      case "qwen":
        return await saveQwenConfig({ baseUrl, apiKey, model, models });
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
 * DELETE /api/cli-tools/guide-settings/:toolId
 *
 * Undoes what POST wrote. Both files belong to the user — Continue's other assistants,
 * opencode's plugins and MCP servers — so the managed entries are removed in place and the
 * file is rewritten, never deleted.
 */
export async function DELETE(request: Request, { params }) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { toolId } = await params;

  try {
    switch (toolId) {
      case "continue":
        return await resetContinueConfig();
      case "opencode":
        return await resetOpenCodeConfig();
      case "qwen":
        return await resetQwenConfig();
      default:
        return NextResponse.json(
          { error: `Config reset not supported for: ${toolId}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

const getContinueConfigPath = () => path.join(getCliConfigHome(), ".continue", "config.yaml");

/** Qwen reads its credentials from `~/.qwen/.env`; settings.json only names the variable. */
const upsertEnvVar = (envText: string, key: string, value: string) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(envText)) return envText.replace(re, line);
  return envText.length > 0 && !envText.endsWith("\n")
    ? `${envText}\n${line}\n`
    : `${envText}${line}\n`;
};

const removeEnvVar = (envText: string, key: string) =>
  envText.replace(new RegExp(`^${key}=.*\\r?\\n?`, "m"), "");

/** The endpoints an entry may carry from a previous apply, whatever port was in use then. */
const getLocalHosts = () => {
  const { apiPort } = getRuntimePorts();
  return [`localhost:${apiPort}`, `127.0.0.1:${apiPort}`];
};

async function resetContinueConfig() {
  const configPath = getContinueConfigPath();

  let existingConfig: unknown;
  try {
    existingConfig = loadYaml(await fs.readFile(configPath, "utf-8")) ?? {};
  } catch {
    return NextResponse.json({ success: true, message: "No Continue config to reset" });
  }

  const config = removeRoutiformContinueConfig(existingConfig, { localHosts: getLocalHosts() });
  await fs.writeFile(configPath, dumpYaml(config, { indent: 2, lineWidth: -1 }), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Routiform models removed from ${configPath}`,
    configPath,
  });
}

const getQwenDir = () => path.join(getCliConfigHome(), ".qwen");
const getQwenConfigPath = () => path.join(getQwenDir(), "settings.json");
const getQwenEnvPath = () => path.join(getQwenDir(), ".env");

async function resetQwenConfig() {
  const configPath = getQwenConfigPath();

  let existingConfig: unknown;
  try {
    existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    return NextResponse.json({ success: true, message: "No Qwen Code config to reset" });
  }

  const config = removeRoutiformQwenConfig(existingConfig, { localHosts: getLocalHosts() });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  // The key lives in ~/.qwen/.env, not in settings.json, so it has to be dropped separately
  // or the next apply would silently keep authenticating with the old one.
  try {
    const envText = await fs.readFile(getQwenEnvPath(), "utf-8");
    await fs.writeFile(getQwenEnvPath(), removeEnvVar(envText, QWEN_API_KEY_ENV), "utf-8");
  } catch {
    // No .env to clean up.
  }

  return NextResponse.json({
    success: true,
    message: `Routiform models removed from ${configPath}`,
    configPath,
  });
}

async function resetOpenCodeConfig() {
  const configPath = getOpenCodeConfigPath();

  let existingConfig: Record<string, unknown>;
  try {
    existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    return NextResponse.json({ success: true, message: "No OpenCode config to reset" });
  }

  const config = removeRoutiformOpenCodeConfig(existingConfig);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Routiform providers removed from ${configPath}`,
    configPath,
  });
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
 * Save Qwen Code config to ~/.qwen/settings.json, with the key in ~/.qwen/.env.
 *
 * Qwen keys `modelProviders` by auth type and stores an array of model entries under it,
 * so every selected model becomes its own entry. Credentials are deliberately kept out of
 * settings.json — an entry names the variable, the runtime reads it from the environment.
 */
async function saveQwenConfig({ baseUrl, apiKey, model, models }) {
  const configPath = getQwenConfigPath();
  await fs.mkdir(getQwenDir(), { recursive: true });

  let existingConfig: unknown = {};
  try {
    existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    // File doesn't exist or is invalid JSON — start fresh.
  }

  // Qwen calculates its context meter from contextWindowSize, so it needs the real window.
  const { contextLengths } = await fetchModelTokenLimits([model, ...(models || [])]);

  const config = applyRoutiformQwenConfig(
    existingConfig,
    { baseUrl, model, models, contextLengths },
    { localHosts: getLocalHosts() }
  );

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  let envText = "";
  try {
    envText = await fs.readFile(getQwenEnvPath(), "utf-8");
  } catch {
    // No .env yet.
  }
  await fs.writeFile(
    getQwenEnvPath(),
    upsertEnvVar(envText, QWEN_API_KEY_ENV, apiKey || "sk_routiform"),
    "utf-8"
  );

  return NextResponse.json({
    success: true,
    message: `Qwen Code config saved to ${configPath}`,
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
