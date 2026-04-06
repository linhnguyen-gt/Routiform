import { generateModels, generateAliasMap, type RegistryModel } from "./providerRegistry.ts";

// Provider models - Generated from providerRegistry.js (single source of truth)
export const PROVIDER_MODELS = generateModels();

// Provider ID to alias mapping - Generated from providerRegistry.js
export const PROVIDER_ID_TO_ALIAS = generateAliasMap();

const ALIAS_TO_PROVIDER_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([providerId, alias]) => [alias, providerId])
);

function resolveProviderModelsKey(aliasOrId: string): string {
  if (PROVIDER_MODELS[aliasOrId]) return aliasOrId;

  const providerId = ALIAS_TO_PROVIDER_ID[aliasOrId] || aliasOrId;
  const providerAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;

  if (PROVIDER_MODELS[providerAlias]) return providerAlias;
  if (PROVIDER_MODELS[providerId]) return providerId;

  return aliasOrId;
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
  const models = PROVIDER_MODELS[resolveProviderModelsKey(aliasOrId)];
  if (!models) return false;
  return models.some((m) => m.id === modelId);
}

export function findModelName(aliasOrId: string, modelId: string): string {
  const models = PROVIDER_MODELS[resolveProviderModelsKey(aliasOrId)];
  if (!models) return modelId;
  const found = models.find((m) => m.id === modelId);
  return found?.name || modelId;
}

export function getModelTargetFormat(aliasOrId: string, modelId: string): string | null {
  const models = PROVIDER_MODELS[resolveProviderModelsKey(aliasOrId)];
  if (!models) return null;
  const found = models.find((m) => m.id === modelId);
  return found?.targetFormat || null;
}

export function getModelsByProviderId(providerId: string): RegistryModel[] {
  const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  return PROVIDER_MODELS[alias] || [];
}
