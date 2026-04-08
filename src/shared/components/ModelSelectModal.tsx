"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import Button from "./Button";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  OAUTH_PROVIDERS,
  FREE_PROVIDERS,
  APIKEY_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  resolveProviderId,
} from "@/shared/constants/providers";

// Provider order: OAuth first, then Free, then API Key (matches dashboard/providers)
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

/** Last resort when API + direct catalog fetch both return empty (offline / blocked). */
const OPENROUTER_FALLBACK_MODELS: { id: string; name: string }[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
];

/** Merged static + fallback + custom lists can repeat the same model id; keep first occurrence only. */
function dedupeModelsById(models: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
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

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  modelAliases = {},
  addedModelValues = [],
  multiSelect = false,
}) {
  const tCommon = useTranslations("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState<any[]>([]);
  const [providerNodes, setProviderNodes] = useState<any[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, any>>({});
  const [liveModelsByProvider, setLiveModelsByProvider] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  /** OpenRouter catalog (public list); merged in standard provider branch when providerId is openrouter. */
  const [openrouterCatalog, setOpenrouterCatalog] = useState<{ id: string; name?: string }[]>([]);

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
      const data = await res.json();
      setCombos(data.combos || []);
    } catch (error) {
      console.error("Error fetching combos:", error);
      setCombos([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCombos();
  }, [isOpen]);

  const fetchProviderNodes = async () => {
    try {
      const res = await fetch("/api/provider-nodes");
      if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
      const data = await res.json();
      setProviderNodes(data.nodes || []);
    } catch (error) {
      console.error("Error fetching provider nodes:", error);
      setProviderNodes([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchProviderNodes();
  }, [isOpen]);

  const fetchCustomModels = async () => {
    try {
      const res = await fetch("/api/provider-models");
      if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
      const data = await res.json();
      setCustomModels(data.models || {});
    } catch (error) {
      console.error("Error fetching custom models:", error);
      setCustomModels({});
    }
  };

  useEffect(() => {
    if (isOpen) fetchCustomModels();
  }, [isOpen]);

  const fetchLiveProviderModels = useCallback(async () => {
    try {
      const grouped = new Map<string, any[]>();
      for (const conn of activeProviders) {
        const providerId = typeof conn?.provider === "string" ? conn.provider : "";
        if (!providerId) continue;
        const list = grouped.get(providerId) || [];
        list.push(conn);
        grouped.set(providerId, list);
      }

      const firstConnections = Array.from(grouped.entries())
        .map(([providerId, conns]) => {
          const sorted = [...conns].sort(
            (a, b) => Number(a?.priority || 0) - Number(b?.priority || 0)
          );
          return { providerId, connectionId: sorted[0]?.id };
        })
        .filter((row) => typeof row.connectionId === "string" && row.connectionId.length > 0);

      const entries = await Promise.all(
        firstConnections.map(async ({ providerId, connectionId }) => {
          try {
            const res = await fetch(`/api/providers/${encodeURIComponent(connectionId)}/models`, {
              cache: "no-store",
            });
            if (!res.ok) return [providerId, []] as const;
            const data = await res.json().catch(() => ({}));
            const raw = Array.isArray(data?.models) ? data.models : [];
            const models = raw
              .map((m: any) => {
                const id = String(m?.id ?? m?.name ?? "").trim();
                if (!id) return null;
                return {
                  id,
                  name: String(m?.name ?? m?.display_name ?? m?.displayName ?? id).trim() || id,
                };
              })
              .filter(Boolean) as Array<{ id: string; name: string }>;
            return [providerId, models] as const;
          } catch {
            return [providerId, []] as const;
          }
        })
      );

      setLiveModelsByProvider(
        Object.fromEntries(
          entries.filter(([, models]) => Array.isArray(models) && models.length > 0)
        )
      );
    } catch {
      setLiveModelsByProvider({});
    }
  }, [activeProviders]);

  useEffect(() => {
    if (isOpen) fetchLiveProviderModels();
  }, [isOpen, fetchLiveProviderModels]);

  const fetchOpenrouterCatalog = async () => {
    const normalize = (raw: unknown[]) =>
      raw
        .map((m: any) => {
          if (!m || typeof m !== "object") return null;
          const id =
            typeof m.id === "string" && m.id.length > 0
              ? m.id
              : typeof m.canonical_slug === "string" && m.canonical_slug.length > 0
                ? m.canonical_slug
                : "";
          if (!id) return null;
          return { id, name: (typeof m.name === "string" && m.name) || id };
        })
        .filter(Boolean) as { id: string; name: string }[];

    const parsePayload = (json: any) => {
      const raw = json?.data ?? json?.models;
      return Array.isArray(raw) ? raw : [];
    };

    try {
      const res = await fetch("/api/models/openrouter-catalog", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list = normalize(parsePayload(data));
        if (list.length > 0) {
          setOpenrouterCatalog(list);
          return;
        }
      }
    } catch (error) {
      console.error("Error fetching OpenRouter catalog (API):", error);
    }

    // Browser → OpenRouter public API (works when server cache/API is empty; CORS allows this endpoint)
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const list = normalize(parsePayload(json));
        if (list.length > 0) {
          setOpenrouterCatalog(list);
          return;
        }
      }
    } catch (error) {
      console.error("Error fetching OpenRouter catalog (direct):", error);
    }

    setOpenrouterCatalog([]);
  };

  useEffect(() => {
    if (isOpen) fetchOpenrouterCatalog();
  }, [isOpen]);

  const allProviders = useMemo(
    () => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...APIKEY_PROVIDERS }),
    []
  );

  // Group models by provider with priority order
  const groupedModels = useMemo(() => {
    const groups: Record<string, any> = {};

    // Get all active provider IDs from connections
    const activeConnectionIds = activeProviders.map((p) => p.provider);

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
        const syncedEntries = providerCustomModels.map((cm: any) => ({
          id: cm.id,
          name: cm.name || cm.id,
          value: `${alias}/${cm.id}`,
          isCustom: true,
        }));

        // Legacy fallback for older data where synced models were only saved as aliases.
        const legacyAliasEntries =
          syncedEntries.length === 0
            ? Object.entries(modelAliases as Record<string, string>)
                .filter(([, fullModel]: [string, string]) => fullModel.startsWith(`${alias}/`))
                .map(([aliasName, fullModel]: [string, string]) => ({
                  id: fullModel.replace(`${alias}/`, ""),
                  name: aliasName,
                  value: fullModel,
                }))
            : [];

        const allModels = dedupeModelsById([...syncedEntries, ...legacyAliasEntries]);

        if (allModels.length > 0) {
          const matchedNode = providerNodes.find((node) => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      } else if (isCustomProvider) {
        const matchedNode = providerNodes.find((node) => node.id === providerId);
        const displayName = matchedNode?.name || providerInfo.name;
        const nodePrefix = matchedNode?.prefix || providerId; // Consider a more user-friendly fallback if providerId is a UUID

        const syncedEntries = providerCustomModels.map((cm: any) => ({
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
            ? Object.entries(modelAliases as Record<string, string>)
                .filter(
                  ([, fullModel]: [string, string]) =>
                    fullModel.startsWith(`${nodePrefix}/`) || fullModel.startsWith(`${providerId}/`)
                )
                .map(([aliasName, fullModel]: [string, string]) => {
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

        const allModels = dedupeModelsById([
          ...liveEntries,
          ...syncedEntries,
          ...legacyAliasEntries,
        ]);

        if (allModels.length > 0) {
          groups[providerId] = {
            name: displayName,
            alias: nodePrefix,
            color: providerInfo.color,
            models: allModels,
            isCustom: true,
            hasModels: true,
          };
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

        let catalogEntries: any[] = [];
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
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    return groups;
  }, [
    activeProviders,
    modelAliases,
    allProviders,
    providerNodes,
    customModels,
    openrouterCatalog,
    liveModelsByProvider,
  ]);

  // Filter combos by search query
  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter((c) => c.name.toLowerCase().includes(query));
  }, [combos, searchQuery]);

  // Filter models by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, any> = {};

    Object.entries(groupedModels).forEach(([providerId, group]: [string, any]) => {
      const matchedModels = group.models.filter(
        (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
      );

      const providerNameMatches = group.name.toLowerCase().includes(query);

      if (matchedModels.length > 0) {
        filtered[providerId] = {
          ...group,
          models: matchedModels,
        };
      } else if (providerNameMatches) {
        // Search matched provider label but not model ids/names — show full list (e.g. "kiro" vs "Claude Sonnet")
        filtered[providerId] = {
          ...group,
          models: group.models,
        };
      }
    });

    return filtered;
  }, [groupedModels, searchQuery]);

  const handleSelect = (model: any) => {
    onSelect(model);
    if (!multiSelect) {
      onClose();
      setSearchQuery("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchQuery("");
      }}
      title={title}
      size="md"
      className="p-4!"
    >
      {/* Search - compact */}
      <div className="mb-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Models grouped by provider - compact */}
      <div className="max-h-[300px] overflow-y-auto space-y-3">
        {/* Combos section - always first */}
        {filteredCombos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5">
              <span className="material-symbols-outlined text-primary text-[14px]">layers</span>
              <span className="text-xs font-medium text-primary">Combos</span>
              <span className="text-[10px] text-text-muted">({filteredCombos.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredCombos.map((combo) => {
                const isAdded = addedModelValues.includes(combo.name);
                const isHighlighted = !multiSelect && selectedModel === combo.name;
                return (
                  <button
                    key={combo.id}
                    onClick={() =>
                      handleSelect({ id: combo.name, name: combo.name, value: combo.name })
                    }
                    className={`
                      px-2 py-1 rounded-xl text-xs font-medium transition-all border hover:cursor-pointer
                      ${
                        isHighlighted
                          ? "bg-primary text-white border-primary"
                          : isAdded
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    {isAdded && <span className="mr-0.5 opacity-70">✓</span>}
                    {combo.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider models */}
        {Object.entries(filteredGroups).map(([providerId, group]: [string, any]) => (
          <div key={providerId}>
            {/* Provider header */}
            <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-medium text-primary">{group.name}</span>
              <span className="text-[10px] text-text-muted">({group.models.length})</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.models.map((model, modelIndex) => {
                const isAdded = addedModelValues.includes(model.value);
                const isHighlighted = !multiSelect && selectedModel === model.value;
                return (
                  <button
                    key={`${providerId}-${String(model.id)}-${modelIndex}`}
                    onClick={() => handleSelect(model)}
                    className={`
                      px-2 py-1 rounded-xl text-xs font-medium transition-all border hover:cursor-pointer
                      ${
                        isHighlighted
                          ? "bg-primary text-white border-primary"
                          : isAdded
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    {isAdded && <span className="mr-0.5 opacity-70">✓</span>}
                    {model.name}
                    {model.isCustom ? " ★" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
          <div className="text-center py-4 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-1 block">search_off</span>
            <p className="text-xs">No models found</p>
          </div>
        )}
      </div>

      {multiSelect && (
        <div className="flex justify-end mt-3 pt-3 border-t border-border">
          <Button
            type="button"
            onClick={() => {
              onClose();
              setSearchQuery("");
            }}
            size="sm"
          >
            {tCommon("close")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  modelAliases: PropTypes.object,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  multiSelect: PropTypes.bool,
};
