"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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

interface ModelItem {
  id?: unknown;
  name?: unknown;
  value?: unknown;
  isCustom?: boolean;
  [key: string]: unknown;
}

interface ComboItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface ProviderNode {
  id?: string;
  name?: string;
  prefix?: string;
  [key: string]: unknown;
}

interface CustomModelEntry {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface ProviderGroup {
  name: string;
  alias: string;
  color: string;
  models: ModelItem[];
  [key: string]: unknown;
}

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
function dedupeModelsById(models: ModelItem[]): ModelItem[] {
  const seen = new Set<string>();
  const out: ModelItem[] = [];
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
  enableModelTest = false,
}) {
  const tCommon = useTranslations("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState<ComboItem[]>([]);
  const [providerNodes, setProviderNodes] = useState<ProviderNode[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, CustomModelEntry[]>>({});
  const [liveModelsByProvider, setLiveModelsByProvider] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  /** OpenRouter catalog (public list); merged in standard provider branch when providerId is openrouter. */
  const [openrouterCatalog, setOpenrouterCatalog] = useState<{ id: string; name?: string }[]>([]);
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, "ok" | "error">>({});
  const modelTestControllersRef = useRef<Record<string, AbortController>>({});

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
      const grouped = new Map<string, Record<string, unknown>[]>();
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
        firstConnections.map(async ({ providerId, connectionId: _connectionId }) => {
          try {
            const providerConnections = grouped.get(providerId) || [];
            const sortedConnections = [...providerConnections].sort(
              (a, b) => Number(a?.priority || 0) - Number(b?.priority || 0)
            );

            for (const conn of sortedConnections) {
              const currentId = String(conn?.id || "");
              if (!currentId) continue;
              const res = await fetch(`/api/providers/${encodeURIComponent(currentId)}/models`, {
                cache: "no-store",
              });
              if (!res.ok) continue;
              const data = await res.json().catch(() => ({}));
              const raw = Array.isArray(data?.models) ? data.models : [];
              const models = raw
                .map((m: Record<string, unknown>) => {
                  const id = String(m?.id ?? m?.name ?? "").trim();
                  if (!id) return null;
                  return {
                    id,
                    name: String(m?.name ?? m?.display_name ?? m?.displayName ?? id).trim() || id,
                  };
                })
                .filter(Boolean) as Array<{ id: string; name: string }>;
              if (models.length > 0) return [providerId, models] as const;
            }

            return [providerId, []] as const;
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
        .map((m: unknown) => {
          if (!m || typeof m !== "object") return null;
          const obj = m as Record<string, unknown>;
          const id =
            typeof obj.id === "string" && obj.id.length > 0
              ? obj.id
              : typeof obj.canonical_slug === "string" && obj.canonical_slug.length > 0
                ? obj.canonical_slug
                : "";
          if (!id) return null;
          return { id, name: (typeof obj.name === "string" && obj.name) || id };
        })
        .filter(Boolean) as { id: string; name: string }[];

    const parsePayload = (json: Record<string, unknown>) => {
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

  useEffect(() => {
    if (!isOpen) {
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
      setTestingModels({});
      setModelTestStatus({});
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
    },
    []
  );

  const handleTestModel = useCallback(
    async (modelValue: string, key: string) => {
      if (!enableModelTest || !modelValue) return;
      if (modelTestControllersRef.current[key]) return;

      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 30000);
      modelTestControllersRef.current[key] = controller;

      setTestingModels((prev) => ({ ...prev, [key]: true }));
      setModelTestStatus((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelValue }),
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: number | string;
        };
        const providerStatus =
          typeof payload.status === "number"
            ? payload.status
            : typeof payload.status === "string" && /^\d+$/.test(payload.status)
              ? Number.parseInt(payload.status, 10)
              : null;
        const passed = res.ok && payload.ok === true && !(providerStatus && providerStatus >= 400);
        setModelTestStatus((prev) => ({ ...prev, [key]: passed ? "ok" : "error" }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError" && !timedOut) {
          return;
        }
        setModelTestStatus((prev) => ({ ...prev, [key]: "error" }));
      } finally {
        clearTimeout(timeout);
        if (modelTestControllersRef.current[key] === controller) {
          delete modelTestControllersRef.current[key];
        }
        setTestingModels((prev) => ({ ...prev, [key]: false }));
      }
    },
    [enableModelTest]
  );

  const allProviders = useMemo(
    () => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...APIKEY_PROVIDERS }),
    []
  );

  // Group models by provider with priority order
  const groupedModels = useMemo(() => {
    const groups: Record<string, ProviderGroup> = {};

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
            ? Object.entries(modelAliases as Record<string, string>)
                .filter(([, fullModel]: [string, string]) => fullModel.startsWith(`${alias}/`))
                .map(([aliasName, fullModel]: [string, string]) => ({
                  id: fullModel.replace(`${alias}/`, ""),
                  name: aliasName,
                  value: fullModel,
                }))
            : [];

        const allModels = dedupeModelsById([
          ...liveEntries,
          ...syncedEntries,
          ...legacyAliasEntries,
        ]);

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

    const q = searchQuery.toLowerCase();
    const result: Record<string, ProviderGroup> = {};

    Object.entries(groupedModels).forEach(([providerId, group]: [string, ProviderGroup]) => {
      const matchedModels = group.models.filter(
        (m) =>
          String(m.name ?? "")
            .toLowerCase()
            .includes(q) ||
          String(m.id ?? "")
            .toLowerCase()
            .includes(q)
      );

      const providerNameMatches = group.name.toLowerCase().includes(q);

      if (matchedModels.length > 0) {
        result[providerId] = {
          ...group,
          models: matchedModels,
        };
      } else if (providerNameMatches) {
        result[providerId] = {
          ...group,
          models: group.models,
        };
      }
    });

    return result;
  }, [groupedModels, searchQuery]);

  const handleSelect = (model: ModelItem) => {
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
                    {isAdded && (
                      <span className="mr-0.5 opacity-70 text-[10px] uppercase">added</span>
                    )}
                    {combo.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider models */}
        {Object.entries(filteredGroups).map(([providerId, group]) => (
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
                const modelValue = String(model.value ?? "");
                const testKey = `${providerId}:${modelValue}`;
                const isTestingModel = !!testingModels[testKey];
                const testStatus = modelTestStatus[testKey];
                const testLabel = isTestingModel
                  ? "Testing model..."
                  : testStatus === "ok"
                    ? "Model test passed"
                    : testStatus === "error"
                      ? "Model test failed"
                      : "Test model";

                if (enableModelTest) {
                  return (
                    <div
                      key={`${providerId}-${String(model.id)}-${modelIndex}`}
                      className="inline-flex"
                    >
                      <button
                        onClick={() => handleSelect(model)}
                        className={`
                          px-2 py-1 rounded-l-xl text-xs font-medium transition-all border border-r-0 hover:cursor-pointer
                          ${
                            isHighlighted
                              ? "bg-primary text-white border-primary"
                              : isAdded
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                          }
                        `}
                      >
                        {isAdded && (
                          <span className="mr-0.5 opacity-70 text-[10px] uppercase">added</span>
                        )}
                        {String(model.name ?? model.id ?? "")}
                        {model.isCustom ? " ★" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestModel(modelValue, testKey)}
                        disabled={isTestingModel}
                        aria-label={testLabel}
                        title={testLabel}
                        className={`
                          px-1.5 py-1 rounded-r-xl text-xs border transition-all
                          ${
                            testStatus === "ok"
                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                              : testStatus === "error"
                                ? "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10"
                                : "border-border text-text-muted bg-surface hover:border-primary/50 hover:text-primary"
                          }
                          ${isTestingModel ? "opacity-60 cursor-not-allowed" : "hover:cursor-pointer"}
                        `}
                      >
                        <span
                          className={`material-symbols-outlined text-[12px] ${isTestingModel ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        >
                          {isTestingModel
                            ? "progress_activity"
                            : testStatus === "ok"
                              ? "check_circle"
                              : testStatus === "error"
                                ? "error"
                                : "play_arrow"}
                        </span>
                      </button>
                    </div>
                  );
                }

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
                    {isAdded && (
                      <span className="mr-0.5 opacity-70 text-[10px] uppercase">added</span>
                    )}
                    {String(model.name ?? model.id ?? "")}
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
  enableModelTest: PropTypes.bool,
};
