import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import {
  getCliConfigHome,
  getOpenCodeConfigPath,
  resolveGrokConfigPath,
  resolveKimiConfigPath,
  resolveOmpWritePaths,
} from "@/shared/services/cliRuntime";
import {
  applyRoutiformKimiConfig,
  removeRoutiformKimiConfig,
  toKimiModelAlias,
} from "@/shared/services/kimiConfigToml";
import {
  applyRoutiformGrokConfig,
  removeRoutiformGrokConfig,
  toGrokModelAlias,
} from "@/shared/services/grokConfigToml";
import {
  applyRoutiformOmpModels,
  applyRoutiformOmpSettings,
  removeRoutiformOmpModels,
  removeRoutiformOmpSettings,
  toOmpModelSelector,
} from "@/shared/services/ompConfig";
import { createBackup } from "@/shared/services/backupService";
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
 * Currently supports: continue, opencode, qwen, omp
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
      case "omp":
        return await saveOmpConfig({ baseUrl, apiKey, model, models });
      case "kimi":
        return await saveKimiConfig({ baseUrl, apiKey, model, models });
      case "grok":
        return await saveGrokConfig({ baseUrl, apiKey, model, models });
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
      case "omp":
        return await resetOmpConfig();
      case "kimi":
        return await resetKimiConfig();
      case "grok":
        return await resetGrokConfig();
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
  await createBackup("continue", configPath);
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
  await createBackup("qwen", configPath);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  // The key lives in ~/.qwen/.env, not in settings.json, so it has to be dropped separately
  // or the next apply would silently keep authenticating with the old one.
  try {
    const envText = await fs.readFile(getQwenEnvPath(), "utf-8");
    await createBackup("qwen", getQwenEnvPath());
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

/**
 * Read a YAML config that belongs to the user.
 *
 * A missing or empty file legitimately means "start fresh" — this js-yaml throws on empty
 * input rather than returning undefined, so that case is matched on the content, not the
 * error. A *parse* error is different: treating a file with one bad indent as empty would
 * replace every provider or setting in it on the next write, with no way back. That throws.
 */
async function readOmpYaml(filePath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  if (!raw.trim()) return {};

  try {
    return (loadYaml(raw) as Record<string, unknown>) ?? {};
  } catch {
    throw new Error(
      `${filePath} is not valid YAML. Fix or move it before saving, so your other providers are not overwritten.`
    );
  }
}

/**
 * omp's YAML files are the user's — unrelated providers and roles are rewritten in place.
 * A file left with no keys is deleted rather than written as `{}`: an empty `models.yml`
 * still counts as present, so it would keep shadowing a `models.yaml` and keep omp's
 * first-run migration from ever firing.
 */
async function resetOmpConfig() {
  const { models: modelsPath, config: configPath } = await resolveOmpWritePaths();

  const rewrite = async (filePath: string, transform: (parsed: unknown) => unknown) => {
    if (!(await pathExists(filePath))) return false;

    const next = transform(await readOmpYaml(filePath)) as Record<string, unknown>;
    await createBackup("omp", filePath);
    if (Object.keys(next).length === 0) {
      await fs.unlink(filePath);
      return true;
    }
    await fs.writeFile(filePath, dumpYaml(next, { indent: 2, lineWidth: -1 }), "utf-8");
    return true;
  };

  const touchedModels = await rewrite(modelsPath, removeRoutiformOmpModels);
  await rewrite(configPath, removeRoutiformOmpSettings);

  if (!touchedModels) {
    return NextResponse.json({ success: true, message: "No Oh My Pi config to reset" });
  }

  return NextResponse.json({
    success: true,
    message: `Routiform provider removed from ${modelsPath}`,
    configPath: modelsPath,
  });
}

const pathExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

async function resetOpenCodeConfig() {
  const configPath = getOpenCodeConfigPath();

  let existingConfig: Record<string, unknown>;
  try {
    existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    return NextResponse.json({ success: true, message: "No OpenCode config to reset" });
  }

  const config = removeRoutiformOpenCodeConfig(existingConfig);
  await createBackup("opencode", configPath);
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

  await createBackup("continue", configPath);
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

  await createBackup("qwen", configPath);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  let envText = "";
  try {
    envText = await fs.readFile(getQwenEnvPath(), "utf-8");
  } catch {
    // No .env yet.
  }
  await createBackup("qwen", getQwenEnvPath());
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
 * Save Oh My Pi config: the provider block into ~/.omp/agent/models.yml and the default
 * model role into ~/.omp/agent/config.yml. Both files are merged, never replaced — other
 * providers, roles, and settings the user set stay as they are.
 */
async function saveOmpConfig({ baseUrl, apiKey, model, models }) {
  const {
    dir,
    models: modelsPath,
    config: configPath,
    legacyModels,
    blocksSettingsMigration,
  } = await resolveOmpWritePaths();
  await fs.mkdir(dir, { recursive: true });

  // omp shows context usage and caps output per model, so it needs the real limits.
  const { contextLengths, maxOutputTokens } = await fetchModelTokenLimits([
    model,
    ...(models || []),
  ]);

  // A `models.json` here is one omp would have migrated into `models.yml` itself. Carrying
  // it forward reproduces that migration instead of stranding the providers in it.
  const existingModels = await readOmpYaml(legacyModels || modelsPath);

  await createBackup("omp", modelsPath);
  const nextModels = applyRoutiformOmpModels(existingModels, {
    baseUrl,
    apiKey,
    model,
    models,
    contextLengths,
    maxOutputTokens,
  });
  await fs.writeFile(modelsPath, dumpYaml(nextModels, { indent: 2, lineWidth: -1 }), "utf-8");

  // Creating config.yml when neither spelling exists would cancel omp's one-time migration
  // of settings.json and the legacy agent.db, so the default model is left for omp's own
  // `/model` picker in that case rather than silently costing the user their settings.
  if (blocksSettingsMigration) {
    return NextResponse.json({
      success: true,
      message: `Provider saved to ${modelsPath}. Oh My Pi has not migrated its settings yet, so the default model was not set — run omp once, then pick ${toOmpModelSelector(model)} with /model.`,
      configPath: modelsPath,
    });
  }

  await createBackup("omp", configPath);
  const nextSettings = applyRoutiformOmpSettings(await readOmpYaml(configPath), model);
  await fs.writeFile(configPath, dumpYaml(nextSettings, { indent: 2, lineWidth: -1 }), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Oh My Pi config saved to ${modelsPath}`,
    configPath: modelsPath,
  });
}

/** Shared by the TOML-configured CLIs: a config that does not exist yet reads as empty. */
const readTomlConfig = async (filePath: string) => {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
};

/**
 * Save Kimi Code config to ~/.kimi-code/config.toml.
 *
 * The file is edited as lines rather than parsed and rewritten, so the OAuth-provisioned
 * `[providers."managed:kimi-code"]` block, permission rules, hooks and the user's own
 * comments all come through untouched — only the Routiform provider, its model entries and
 * `default_model` are rewritten.
 */
async function saveKimiConfig({ baseUrl, apiKey, model, models }) {
  const configPath = resolveKimiConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  // max_context_size is required on every Kimi model entry, and it drives the context meter.
  const { contextLengths } = await fetchModelTokenLimits([model, ...(models || [])]);

  const existingConfig = await readTomlConfig(configPath);
  await createBackup("kimi", configPath);

  const nextConfig = applyRoutiformKimiConfig(existingConfig, {
    baseUrl,
    apiKey,
    model,
    models,
    contextLengths,
  });
  await fs.writeFile(configPath, nextConfig, "utf-8");

  return NextResponse.json({
    success: true,
    message: `Kimi Code config saved to ${configPath} — run kimi and pick ${toKimiModelAlias(model)}`,
    configPath,
  });
}

async function resetKimiConfig() {
  const configPath = resolveKimiConfigPath();

  const existingConfig = await readTomlConfig(configPath);
  if (!existingConfig) {
    return NextResponse.json({ success: true, message: "No Kimi Code config to reset" });
  }

  await createBackup("kimi", configPath);
  await fs.writeFile(configPath, removeRoutiformKimiConfig(existingConfig), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Routiform provider removed from ${configPath}`,
    configPath,
  });
}

/**
 * Save Grok Build config to ~/.grok/config.toml.
 *
 * The file is edited as lines rather than parsed and rewritten, so `[cli]`, the
 * `[[marketplace.sources]]` array, MCP servers and the user's own model entries come
 * through untouched — only the managed `[model."routiform/…"]` entries and the `default`
 * key inside `[models]` are rewritten.
 */
async function saveGrokConfig({ baseUrl, apiKey, model, models }) {
  const configPath = resolveGrokConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  // context_window drives Grok's auto-compact, so each entry carries the real window.
  const { contextLengths } = await fetchModelTokenLimits([model, ...(models || [])]);

  const existingConfig = await readTomlConfig(configPath);
  await createBackup("grok", configPath);

  const nextConfig = applyRoutiformGrokConfig(existingConfig, {
    baseUrl,
    apiKey,
    model,
    models,
    contextLengths,
  });
  await fs.writeFile(configPath, nextConfig, "utf-8");

  return NextResponse.json({
    success: true,
    message: `Grok Build config saved to ${configPath} — run grok and pick ${toGrokModelAlias(model)}`,
    configPath,
  });
}

async function resetGrokConfig() {
  const configPath = resolveGrokConfigPath();

  const existingConfig = await readTomlConfig(configPath);
  if (!existingConfig) {
    return NextResponse.json({ success: true, message: "No Grok Build config to reset" });
  }

  await createBackup("grok", configPath);
  await fs.writeFile(configPath, removeRoutiformGrokConfig(existingConfig), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Routiform models removed from ${configPath}`,
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

  await createBackup("opencode", configPath);
  await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf-8");

  return NextResponse.json({
    success: true,
    message: `OpenCode config saved to ${configPath}`,
    configPath,
  });
}
