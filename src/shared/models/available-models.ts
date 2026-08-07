// Provider universe: this module uses OAUTH ∪ FREE ∪ APIKEY (the picker universe), NOT
// AI_PROVIDERS. AI_PROVIDERS additionally spreads UPSTREAM_PROXY_PROVIDERS and
// LOCAL_PROVIDERS, so `cliproxyapi` and `ollama-local` exist there but not here.
// Consequence, carried forward from ModelSelectModal: an `ollama-local` connection gets
// the `{ name: providerId, color: "#666" }` fallback, so its `passthroughModels: true` is
// invisible and it takes the static-registry branch rather than the passthrough branch.
// Phase 04's policy helpers and phase 06's validator read AI_PROVIDERS (the wider set) on
// purpose — a template/validator must not be blind to a provider the router can serve.
// If you unify these, fix all three call sites together.
//
// This derivation is a verbatim transcription of ModelSelectModal's `groupedModels` memo.
// It is pinned by tests/unit/available-models-derivation.test.mjs against an inline copy of
// the original. Do NOT tidy the double `.replace()` or the falsy-id push — the fixtures
// exist to catch exactly that.

import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
  OAUTH_PROVIDERS,
  resolveProviderId,
} from "@/shared/constants/providers";
import type { ProviderConnection } from "./provider-connection";

export interface AvailableModel {
  /** The exact string stored in a combo: `${prefix}/${id}`. */
  value: string;
  id: string;
  name: string;
  providerId: string;
  prefix: string;
  isCustom?: boolean;
}

export interface AvailableModelGroup {
  providerId: string;
  name: string;
  alias: string;
  color: string;
  models: AvailableModel[];
  isCustom?: boolean;
  hasModels?: boolean;
}

export interface AvailableProviderNode {
  id?: string;
  name?: string;
  prefix?: string;
  [key: string]: unknown;
}

export interface DeriveAvailableModelsInput {
  connections: ProviderConnection[];
  liveModelsByProvider: Record<string, Array<{ id: string; name: string }>>;
  customModels: Record<string, Array<{ id: string; name?: string }>>;
  providerNodes: AvailableProviderNode[];
  modelAliases: Record<string, string>;
  openrouterCatalog: Array<{ id: string; name?: string }>;
}

/** Provider order: OAuth first, then Free, then API Key (matches dashboard/providers). */
export const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

/** Last resort when API + direct catalog fetch both return empty (offline / blocked). */
export const OPENROUTER_FALLBACK_MODELS: { id: string; name: string }[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
];

/** Merged static + fallback + custom lists can repeat the same model id; keep first occurrence only. */
export function dedupeModelsById<T extends { id?: unknown }>(models: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of models) {
    const id = m?.id != null ? String(m.id) : "";
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(m);
  }
  return out;
}

type ProviderInfo = { name: string; color: string; passthroughModels?: boolean };

export function deriveAvailableModels(input: DeriveAvailableModelsInput): AvailableModelGroup[] {
  const {
    connections,
    liveModelsByProvider,
    customModels,
    providerNodes,
    modelAliases,
    openrouterCatalog,
  } = input;

  const allProviders: Record<string, ProviderInfo> = {
    ...OAUTH_PROVIDERS,
    ...FREE_PROVIDERS,
    ...APIKEY_PROVIDERS,
  } as Record<string, ProviderInfo>;

  const groups: AvailableModelGroup[] = [];

  // Get all active provider IDs from connections
  const activeConnectionIds = connections.map((p) => p.provider);

  // Only show connected providers (including both standard and custom)
  const providerIdsToShow = new Set([
    ...activeConnectionIds, // Only connected providers
  ]);

  // Sort by PROVIDER_ORDER
  const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
    const indexA = PROVIDER_ORDER.indexOf(a);
    const indexB = PROVIDER_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  sortedProviderIds.forEach((rawProviderId) => {
    const providerId = resolveProviderId(rawProviderId) || rawProviderId;
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
    const isCustomProvider =
      isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
    const liveProviderModels =
      liveModelsByProvider[rawProviderId] || liveModelsByProvider[providerId] || [];

    // Get user-added custom models for this provider (if any)
    const providerCustomModels = customModels[providerId] || customModels[rawProviderId] || [];

    if (providerInfo.passthroughModels) {
      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${alias}/${m.id}`,
      }));

      const syncedEntries = providerCustomModels.map((cm) => ({
        id: cm.id,
        name: cm.name || cm.id,
        value: `${alias}/${cm.id}`,
        isCustom: true,
      }));

      // Legacy fallback for older data where synced models were only saved as aliases.
      const legacyAliasEntries =
        syncedEntries.length === 0
          ? Object.entries(modelAliases)
              .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
              .map(([aliasName, fullModel]) => ({
                id: fullModel.replace(`${alias}/`, ""),
                name: aliasName,
                value: fullModel,
              }))
          : [];

      const allModels = dedupeModelsById([...liveEntries, ...syncedEntries, ...legacyAliasEntries]);

      if (allModels.length > 0) {
        const matchedNode = providerNodes.find((node) => node.id === providerId);
        const displayName = matchedNode?.name || providerInfo.name;

        groups.push({
          providerId,
          name: displayName,
          alias: alias,
          color: providerInfo.color,
          models: stampModels(allModels, providerId, alias),
        });
      }
    } else if (isCustomProvider) {
      const matchedNode = providerNodes.find((node) => node.id === providerId);
      const displayName = matchedNode?.name || providerInfo.name;
      const nodePrefix = matchedNode?.prefix || providerId; // Consider a more user-friendly fallback if providerId is a UUID

      const syncedEntries = providerCustomModels.map((cm) => ({
        id: cm.id,
        name: cm.name || cm.id,
        value: `${nodePrefix}/${cm.id}`,
        isCustom: true,
      }));

      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${nodePrefix}/${m.id}`,
      }));

      // Legacy fallback for older data where compatible provider models lived in aliases.
      const legacyAliasEntries =
        syncedEntries.length === 0
          ? Object.entries(modelAliases)
              .filter(
                ([, fullModel]) =>
                  fullModel.startsWith(`${nodePrefix}/`) || fullModel.startsWith(`${providerId}/`)
              )
              .map(([aliasName, fullModel]) => {
                const modelId = fullModel
                  .replace(`${nodePrefix}/`, "")
                  .replace(`${providerId}/`, "");
                return {
                  id: modelId,
                  name: aliasName,
                  value: `${nodePrefix}/${modelId}`,
                };
              })
          : [];

      const allModels = dedupeModelsById([...liveEntries, ...syncedEntries, ...legacyAliasEntries]);

      if (allModels.length > 0) {
        groups.push({
          providerId,
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: stampModels(allModels, providerId, nodePrefix),
          isCustom: true,
          hasModels: true,
        });
      }
    } else {
      const systemModels = getModelsByProviderId(providerId);

      const liveEntries = liveProviderModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        value: `${alias}/${m.id}`,
      }));

      const systemEntries = systemModels.map((m) => ({
        id: m.id,
        name: m.name,
        value: `${alias}/${m.id}`,
      }));

      const customEntries = providerCustomModels
        .filter((cm) => !systemModels.some((sm) => sm.id === cm.id))
        .map((cm) => ({
          id: cm.id,
          name: cm.name || cm.id,
          value: `${alias}/${cm.id}`,
          isCustom: true,
        }));

      let catalogEntries: { id: string; name: string; value: string }[] = [];
      if (providerId === "openrouter") {
        const already = new Set([
          ...systemEntries.map((m) => String(m.id)),
          ...customEntries.map((c) => String(c.id)),
        ]);
        const source =
          openrouterCatalog.length > 0 ? openrouterCatalog : OPENROUTER_FALLBACK_MODELS;
        catalogEntries = source
          .filter((m) => m?.id && !already.has(String(m.id)))
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${alias}/${m.id}`,
          }));
      }

      const allModels =
        liveEntries.length > 0
          ? dedupeModelsById([...liveEntries, ...customEntries])
          : dedupeModelsById([...systemEntries, ...customEntries, ...catalogEntries]);

      if (allModels.length > 0) {
        groups.push({
          providerId,
          name: providerInfo.name,
          alias: alias,
          color: providerInfo.color,
          models: stampModels(allModels, providerId, alias),
        });
      }
    }
  });

  return groups;
}

/**
 * Attach the group's providerId/prefix to each model so the template resolver
 * does not have to re-derive them. Purely additive — no existing field changes.
 */
function stampModels(
  models: Array<{ id?: unknown; name?: unknown; value: string; isCustom?: boolean }>,
  providerId: string,
  prefix: string
): AvailableModel[] {
  return models.map((m) => ({
    ...m,
    id: m.id as string,
    name: m.name as string,
    providerId,
    prefix,
  }));
}

export function flattenAvailableModels(groups: AvailableModelGroup[]): AvailableModel[] {
  return groups.flatMap((group) => group.models);
}
