import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { getCliConfigHome, getOpenCodeConfigPath } from "@/shared/services/cliRuntime";
import { mergeOpenCodeConfig } from "@/shared/services/opencodeConfig";
import {
  guideSettingsSaveSchema,
  opencodeGuideSettingsSaveSchema,
} from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

/**
 * POST /api/cli-tools/guide-settings/:toolId
 *
 * Save configuration for guide-based tools that have config files.
 * Currently supports: continue, opencode
 */
export async function POST(request, { params }) {
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
      case "qwen":
        return await saveQwenConfig({ baseUrl, apiKey, model });
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
 * Save Continue config to ~/.continue/config.json
 * Merges with existing config if present.
 */
async function saveContinueConfig({ baseUrl, apiKey, model }) {
  const { apiPort } = getRuntimePorts();
  const configPath = path.join(getCliConfigHome(), ".continue", "config.json");
  const configDir = path.dirname(configPath);

  // Ensure dir exists
  await fs.mkdir(configDir, { recursive: true });

  // Read existing config if any
  let existingConfig: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    existingConfig = JSON.parse(raw);
  } catch {
    // No existing config or invalid JSON — start fresh
  }

  // Build the Routiform model entry
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const routerModel = {
    apiBase: normalizedBaseUrl,
    title: model,
    model: model,
    provider: "openai",
    apiKey: apiKey || "sk_routiform",
    routiformManaged: true,
  };

  // Merge into existing models array
  const models = existingConfig.models || [];

  function normalizeApiBase(value: unknown): string {
    return String(value || "")
      .trim()
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  // Check if Routiform entry already exists and update it, or add new
  const existingIdx = (models as unknown[]).findIndex(
    (m) =>
      m &&
      typeof m === "object" &&
      m !== null &&
      ((m as Record<string, unknown>).routiformManaged === true ||
        (m as Record<string, unknown>).routiformManaged === true ||
        normalizeApiBase((m as Record<string, unknown>).apiBase) ===
          normalizedBaseUrl.toLowerCase() ||
        normalizeApiBase((m as Record<string, unknown>).apiBase).includes("routiform") ||
        normalizeApiBase((m as Record<string, unknown>).apiBase).includes("routiform") ||
        normalizeApiBase((m as Record<string, unknown>).apiBase).includes(`localhost:${apiPort}`) ||
        normalizeApiBase((m as Record<string, unknown>).apiBase).includes(`127.0.0.1:${apiPort}`) ||
        String((m as Record<string, unknown>).apiKey || "")
          .toLowerCase()
          .includes("sk_routiform"))
  );

  if (existingIdx >= 0) {
    models[existingIdx] = routerModel;
  } else {
    (models as unknown[]).push(routerModel);
  }

  existingConfig.models = models;

  // Write back
  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), "utf-8");

  return NextResponse.json({
    success: true,
    message: `Continue config saved to ${configPath}`,
    configPath,
  });
}

/**
 * Save Qwen Code config to ~/.qwen/settings.json
 * Qwen Code reads this file for its API configuration.
 */
async function saveQwenConfig({ baseUrl, apiKey, model }) {
  const configPath = path.join(getCliConfigHome(), ".qwen", "settings.json");
  const configDir = path.dirname(configPath);

  await fs.mkdir(configDir, { recursive: true });

  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");

  let existingConfig: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    existingConfig = JSON.parse(raw);
  } catch {
    // No existing config or invalid JSON — start fresh
  }

  existingConfig.apiBaseUrl = normalizedBaseUrl;
  existingConfig.apiKey = apiKey || "";
  if (model) {
    existingConfig.defaultModel = model;
  }

  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), "utf-8");

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

  // Lookup context_length and max_output_tokens for each model from /v1/models
  // so opencode can show % used and know output limits
  const modelContextLengths: Record<string, number> = {};
  const modelMaxOutputTokens: Record<string, number> = {};
  try {
    const allModelIds = [...new Set([model, ...(models || [])].filter(Boolean))] as string[];
    if (allModelIds.length > 0) {
      const res = await fetch(`http://localhost:${process.env.PORT || 20128}/v1/models`);
      if (res.ok) {
        const data = await res.json();
        const modelList: Array<Record<string, unknown>> = data?.data || [];
        for (const modelId of allModelIds) {
          // /v1/models returns ids like "cx/gpt-5.4" — match against the bare model id
          const entry = modelList.find(
            (m) => m.id === modelId || String(m.id).endsWith(`/${modelId}`)
          );
          const contextLength = entry?.context_length;
          if (typeof contextLength === "number" && contextLength > 0) {
            modelContextLengths[modelId] = contextLength;
          }
          const maxOutput = entry?.max_output_tokens;
          if (typeof maxOutput === "number" && maxOutput > 0) {
            modelMaxOutputTokens[modelId] = maxOutput;
          }
        }
      }
    }
  } catch {
    // Non-fatal — proceed without context lengths
  }

  const nextConfig = mergeOpenCodeConfig(existingConfig, {
    baseUrl: normalizedBaseUrl,
    apiKey,
    model,
    models,
    modelContextLengths,
    modelMaxOutputTokens,
  });

  await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf-8");

  return NextResponse.json({
    success: true,
    message: `OpenCode config saved to ${configPath}`,
    configPath,
  });
}
