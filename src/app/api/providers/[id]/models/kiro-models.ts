import type { JsonRecord } from "./json-types";
import { asRecord } from "./json-utils";

const DEFAULT_KIRO_BASE_URL = "https://codewhisperer.us-east-1.amazonaws.com";

const FALLBACK_KIRO_MODELS: Array<{ id: string; name: string; credits: string }> = [
  { id: "auto", name: "Auto", credits: "1.00x" },
  { id: "claude-opus-4.7", name: "Claude Opus 4.7 — Experimental preview", credits: "2.20x" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", credits: "2.20x" },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6 — Latest Sonnet model", credits: "1.30x" },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5", credits: "2.20x" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", credits: "1.30x" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", credits: "1.30x" },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", credits: "0.40x" },
  { id: "deepseek-3.2", name: "DeepSeek 3.2", credits: "0.25x" },
  { id: "minimax-m2.5", name: "MiniMax M2.5", credits: "0.25x" },
  { id: "minimax-m2.1", name: "MiniMax M2.1", credits: "0.15x" },
  { id: "glm-5", name: "GLM-5", credits: "0.50x" },
  { id: "qwen3-coder-next", name: "Qwen3 Coder Next", credits: "0.05x" },
];

function getDefaultKiroModels(): Array<JsonRecord> {
  return FALLBACK_KIRO_MODELS.map((m) => ({
    id: m.id,
    name: `${m.name} (${m.credits} credits)`,
    hidden: false,
    owned_by: "kiro",
  }));
}

export function mergeKiroModels(models: Array<JsonRecord>): Array<JsonRecord> {
  const mergedById = new Map<string, JsonRecord>();

  for (const model of getDefaultKiroModels()) {
    mergedById.set(String(model.id), model);
  }

  for (const model of models) {
    const id = typeof model.id === "string" ? model.id : "";
    if (!id) continue;
    mergedById.set(id, {
      ...mergedById.get(id),
      ...model,
    });
  }

  return Array.from(mergedById.values());
}

export function normalizeKiroBaseUrl(baseUrl: string | null): string {
  return (baseUrl || DEFAULT_KIRO_BASE_URL).trim().replace(/\/$/, "");
}

export function buildKiroModelsEndpoint(baseUrl: string): string {
  return baseUrl;
}

function normalizeModelIdFromProfileName(name: string): string {
  const value = name.trim().toLowerCase();
  if (!value) return "";

  const creditsSuffixPattern = /\s*\(\s*\d+(?:\.\d+)?x\s*credits\s*\)$/i;
  const withoutCredits = value.replace(creditsSuffixPattern, "").trim();

  const tokenized = withoutCredits
    .replace(/[–—]/g, "-")
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return tokenized;
}

export function mapKiroModelsFromApi(data: unknown, includeHidden: boolean): Array<JsonRecord> {
  const record = asRecord(data);
  const rawProfiles = Array.isArray(record.profiles) ? record.profiles : [];

  const mapped = rawProfiles
    .map((item) => {
      const profile = asRecord(item);
      const profileName = String(profile.profile_name || profile.profileName || "").trim();
      if (!profileName) return null;

      const modelId = normalizeModelIdFromProfileName(profileName);
      if (!modelId) return null;

      return {
        id: modelId,
        name: profileName,
        hidden: false,
        owned_by: "kiro",
        profileArn:
          typeof profile.arn === "string"
            ? profile.arn
            : typeof profile.profile_arn === "string"
              ? profile.profile_arn
              : undefined,
      };
    })
    .filter((model) => model !== null);

  const visible = includeHidden ? mapped : mapped.filter((model) => model.hidden !== true);

  return mergeKiroModels(visible);
}

/**
 * Map models from the GET /ListAvailableModels REST API response.
 * This endpoint returns rich model metadata including tokenLimits, rateMultiplier, etc.
 */
export function mapKiroModelsFromListApi(data: unknown): Array<JsonRecord> {
  const record = asRecord(data);
  const rawModels = Array.isArray(record.models) ? record.models : [];

  if (rawModels.length === 0) return [];

  const mapped: Array<JsonRecord> = rawModels
    .map((item) => {
      const model = asRecord(item);
      const modelId = typeof model.modelId === "string" ? model.modelId.trim() : "";
      const modelName = typeof model.modelName === "string" ? model.modelName.trim() : "";
      if (!modelId) return null;

      const rateMultiplier = typeof model.rateMultiplier === "number" ? model.rateMultiplier : null;
      const rateUnit = typeof model.rateUnit === "string" ? model.rateUnit : "Credit";
      const description = typeof model.description === "string" ? model.description : undefined;

      // Build display name with credits info
      const creditsLabel =
        rateMultiplier !== null
          ? ` (${rateMultiplier.toFixed(2)}x ${rateUnit.toLowerCase()}s)`
          : "";
      const displayName = `${modelName || modelId}${creditsLabel}`;

      // Extract token limits
      const tokenLimits = asRecord(model.tokenLimits);
      const maxInputTokens =
        typeof tokenLimits.maxInputTokens === "number" ? tokenLimits.maxInputTokens : undefined;
      const maxOutputTokens =
        typeof tokenLimits.maxOutputTokens === "number" ? tokenLimits.maxOutputTokens : undefined;

      // Extract supported input types
      const supportedInputTypes = Array.isArray(model.supportedInputTypes)
        ? model.supportedInputTypes.filter((t: unknown) => typeof t === "string")
        : undefined;

      // Check for thinking support from additionalModelRequestFieldsSchema
      const schema = asRecord(model.additionalModelRequestFieldsSchema);
      const schemaProps = asRecord(schema.properties);
      const supportsThinking = !!schemaProps.thinking;

      return {
        id: modelId,
        name: displayName,
        hidden: false,
        owned_by: "kiro",
        ...(description ? { description } : {}),
        ...(maxInputTokens ? { inputTokenLimit: maxInputTokens } : {}),
        ...(maxOutputTokens ? { outputTokenLimit: maxOutputTokens, maxOutputTokens } : {}),
        ...(supportsThinking ? { supportsThinking: true } : {}),
        ...(supportedInputTypes && supportedInputTypes.length > 0 ? { supportedInputTypes } : {}),
        ...(rateMultiplier !== null ? { rateMultiplier } : {}),
      };
    })
    .filter((model) => model !== null) as Array<JsonRecord>;

  return mapped;
}
