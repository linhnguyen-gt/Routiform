import { generateModels, generateAliasMap } from "./registry-generators.ts";
import type { RegistryModel } from "./registry-types.ts";
import { getClaudeLatestFallbackModels } from "@/shared/services/claudeCodeConfig";

// Provider models - Generated from providerRegistry.js (single source of truth)
export const PROVIDER_MODELS = generateModels();

// Provider ID to alias mapping - Generated from providerRegistry.js
export const PROVIDER_ID_TO_ALIAS = generateAliasMap();

const ALIAS_TO_PROVIDER_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([providerId, alias]) => [alias, providerId])
);

/** Client uses `alias/modelId`; registry rows use bare `modelId` only. */
export function stripProviderPrefixFromModelId(aliasOrId: string, modelId: string): string {
  if (typeof modelId !== "string" || modelId.length === 0) return modelId;
  const key = resolveProviderModelsKey(aliasOrId);
  const alias = PROVIDER_ID_TO_ALIAS[key] || key;
  const providerId = ALIAS_TO_PROVIDER_ID[alias] || key;
  const head = modelId.split("/")[0];
  if (head === alias || head === providerId || head === key) {
    return modelId.slice(head.length + 1);
  }
  return modelId;
}

function resolveProviderModelsKey(aliasOrId: string): string {
  if (PROVIDER_MODELS[aliasOrId]) return aliasOrId;

  const providerId = ALIAS_TO_PROVIDER_ID[aliasOrId] || aliasOrId;
  const providerAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;

  if (PROVIDER_MODELS[providerAlias]) return providerAlias;
  if (PROVIDER_MODELS[providerId]) return providerId;

  return aliasOrId;
}

// PROVIDER_MODELS is keyed by alias — kiro's alias is "kr" (see OAUTH_PROVIDERS.kiro).
const KIRO_MODELS_KEY = "kr";

/**
 * Normalize version separators in a model id: a hyphen between two digits becomes a dot.
 * Kiro's registry ids use dots for versions ("claude-sonnet-4.5") but some clients (CLIs,
 * aliases) send the dash form ("claude-sonnet-4-5"). Only digit-digit hyphens are touched,
 * so word-suffix hyphens stay intact ("-thinking", "-agentic", "qwen3-coder-next").
 */
export function normalizeModelId(modelId: string): string {
  if (typeof modelId !== "string") return modelId;
  return modelId.replace(/(\d)-(\d)/g, "$1.$2");
}

/**
 * Resolve a model id against a provider's catalog, tolerating a `alias/model` prefix.
 * Kiro only: also retries with dash-separated version numbers normalized to dots
 * ("claude-sonnet-4-5" -> "claude-sonnet-4.5") — no cross-provider leakage, every other
 * provider keeps exact-match semantics.
 */
function findModel(
  models: RegistryModel[],
  key: string,
  aliasOrId: string,
  modelId: string
): RegistryModel | undefined {
  const bare = stripProviderPrefixFromModelId(aliasOrId, modelId);
  const found = models.find((m) => m.id === modelId || m.id === bare);
  if (found || key !== KIRO_MODELS_KEY) return found;

  const normalized = normalizeModelId(bare);
  if (normalized === bare) return undefined;
  return models.find((m) => m.id === normalized);
}

// Helper functions
export function getProviderModels(aliasOrId: string): RegistryModel[] {
  return PROVIDER_MODELS[resolveProviderModelsKey(aliasOrId)] || [];
}

export function getDefaultModel(aliasOrId: string): string | null {
  const models = PROVIDER_MODELS[resolveProviderModelsKey(aliasOrId)];
  return models?.[0]?.id || null;
}

export function isValidModel(
  aliasOrId: string,
  modelId: string,
  passthroughProviders = new Set<string>()
): boolean {
  if (passthroughProviders.has(aliasOrId)) return true;
  const key = resolveProviderModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return false;
  return !!findModel(models, key, aliasOrId, modelId);
}

export function findModelName(aliasOrId: string, modelId: string): string {
  const key = resolveProviderModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return modelId;
  const found = findModel(models, key, aliasOrId, modelId);
  return found?.name || modelId;
}

export function getModelTargetFormat(aliasOrId: string, modelId: string): string | null {
  const key = resolveProviderModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return null;
  const found = findModel(models, key, aliasOrId, modelId);
  return found?.targetFormat || null;
}

export function getModelsByProviderId(providerId: string): RegistryModel[] {
  const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  return PROVIDER_MODELS[alias] || [];
}

/**
 * Derive default model list for Claude Code and compatible providers.
 * Uses the shared claude model registry as the single source of truth instead
 * of hardcoding model lists per provider.
 */
export function getClaudeCodeDefaultModels(): RegistryModel[] {
  return getClaudeLatestFallbackModels().filter(
    (m): m is typeof m & { id: string; name: string } =>
      typeof m.id === "string" && typeof m.name === "string"
  ) as RegistryModel[];
}
