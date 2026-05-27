import { useCallback, useEffect, useMemo, useState } from "react";
import { getModelsByProviderId } from "@/shared/constants/models";
import type { CompatModelRow } from "../types";

export interface UseProviderDetailModelsParams {
  providerId: string;
  isSearchProvider: boolean;
  isLiveCatalogProvider: boolean;
  loading: boolean;
  sortedConnectionIds: string[];
}

export interface UseProviderDetailModelsReturn {
  modelMeta: {
    customModels: CompatModelRow[];
    modelCompatOverrides: Array<CompatModelRow & { id: string }>;
  };
  syncedAvailableModels: unknown[];
  opencodeLiveCatalog: {
    status: "idle" | "loading" | "ready" | "no_connection" | "error";
    models: Array<{ id: string; name: string; contextLength?: number }>;
    errorMessage: string;
  };
  models: Array<{ id: string; name: string; contextLength?: number }>;
  registryModels: Array<{ id: string; name: string }>;
  syncedModels: Array<{ id: string; name: string }>;
  setOpencodeLiveCatalog: React.Dispatch<
    React.SetStateAction<{
      status: "idle" | "loading" | "ready" | "no_connection" | "error";
      models: Array<{ id: string; name: string; contextLength?: number }>;
      errorMessage: string;
    }>
  >;
  fetchProviderModelMeta: () => Promise<void>;
}

type ProviderDetailModel = { id: string; name: string; contextLength?: number };
type LiveCatalogState = {
  status: "idle" | "loading" | "ready" | "no_connection" | "error";
  models: ProviderDetailModel[];
  errorMessage: string;
};

function usesFetchedProviderCatalog(providerId: string, isLiveCatalogProvider: boolean): boolean {
  return isLiveCatalogProvider || providerId === "antigravity" || providerId === "claude";
}

function dedupeModelsById<T extends { id: string; name: string }>(models: T[]): T[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export function selectProviderDetailModels({
  providerId,
  isLiveCatalogProvider,
  registryModels,
  syncedModels,
  syncedAvailableModels,
  opencodeLiveCatalog,
}: {
  providerId: string;
  isLiveCatalogProvider: boolean;
  registryModels: ProviderDetailModel[];
  syncedModels: ProviderDetailModel[];
  syncedAvailableModels: ProviderDetailModel[];
  opencodeLiveCatalog: LiveCatalogState;
}): ProviderDetailModel[] {
  if (providerId === "gemini") return dedupeModelsById(syncedAvailableModels);

  if (usesFetchedProviderCatalog(providerId, isLiveCatalogProvider)) {
    if (opencodeLiveCatalog.status === "ready" && opencodeLiveCatalog.models.length > 0) {
      return dedupeModelsById(opencodeLiveCatalog.models);
    }
    if (providerId === "antigravity" || providerId === "claude") return [];
  }

  if (isLiveCatalogProvider) {
    return dedupeModelsById(registryModels);
  }

  if (registryModels.length > 0) {
    // Auto-sync stores only non-registry deltas for most providers, so the
    // detail page must layer synced rows on top of the built-in catalog rather
    // than replacing it outright.
    return dedupeModelsById([...registryModels, ...syncedModels]);
  }

  if (syncedModels.length > 0) {
    return dedupeModelsById(syncedModels);
  }

  return [];
}

export function useProviderDetailModels({
  providerId,
  isSearchProvider,
  isLiveCatalogProvider,
  loading,
  sortedConnectionIds,
}: UseProviderDetailModelsParams): UseProviderDetailModelsReturn {
  const [modelMeta, setModelMeta] = useState<{
    customModels: CompatModelRow[];
    modelCompatOverrides: Array<CompatModelRow & { id: string }>;
  }>({ customModels: [], modelCompatOverrides: [] });
  const [syncedAvailableModels, setSyncedAvailableModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [opencodeLiveCatalog, setOpencodeLiveCatalog] = useState<LiveCatalogState>({
    status: "idle",
    models: [],
    errorMessage: "",
  });

  const registryModels = useMemo(() => getModelsByProviderId(providerId), [providerId]);

  const syncedModels = useMemo(
    () =>
      dedupeModelsById(
        (modelMeta.customModels || [])
          .filter((m) => m?.id && (m.source || "manual") !== "manual")
          .map((m) => ({ id: m.id as string, name: (m.name as string) || (m.id as string) }))
      ),
    [modelMeta.customModels]
  );

  const models = useMemo(() => {
    return selectProviderDetailModels({
      providerId,
      isLiveCatalogProvider,
      registryModels,
      syncedModels,
      syncedAvailableModels,
      opencodeLiveCatalog,
    });
  }, [
    providerId,
    syncedAvailableModels,
    registryModels,
    opencodeLiveCatalog,
    isLiveCatalogProvider,
    syncedModels,
  ]);

  const fetchProviderModelMeta = useCallback(async () => {
    if (isSearchProvider) return;
    try {
      const res = await fetch(`/api/provider-models?provider=${encodeURIComponent(providerId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setModelMeta({
        customModels: data.models || [],
        modelCompatOverrides: data.modelCompatOverrides || [],
      });
      // Fetch synced available models for Gemini
      if (providerId === "gemini") {
        try {
          const syncRes = await fetch("/api/synced-available-models?provider=gemini", {
            cache: "no-store",
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            setSyncedAvailableModels(syncData.models || []);
          }
        } catch {
          // Non-critical
        }
      }
    } catch (e) {
      console.error("fetchProviderModelMeta", e);
    }
  }, [providerId, isSearchProvider]);

  const shouldFetchProviderCatalog = usesFetchedProviderCatalog(providerId, isLiveCatalogProvider);

  useEffect(() => {
    if (!shouldFetchProviderCatalog || loading || isSearchProvider) return;

    if (sortedConnectionIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpencodeLiveCatalog({ status: "no_connection", models: [], errorMessage: "" });
      return;
    }

    let cancelled = false;
    setOpencodeLiveCatalog((prev) =>
      prev.status === "ready" && prev.models.length > 0
        ? { ...prev, status: "loading" }
        : { status: "loading", models: [], errorMessage: "" }
    );

    void (async () => {
      let lastError = "fetch failed";
      try {
        for (const connectionId of sortedConnectionIds) {
          const res = await fetch(`/api/providers/${encodeURIComponent(connectionId)}/models`, {
            cache: "no-store",
          });
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            lastError = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
            continue;
          }

          const raw = Array.isArray(data.models) ? data.models : [];
          const normalized = raw
            .map((m: Record<string, unknown>) => {
              const id = String(m.id ?? m.name ?? "").trim();
              if (!id) return null;
              const name = String(m.name ?? m.displayName ?? m.id ?? "").trim() || id;
              const row: { id: string; name: string; contextLength?: number } = { id, name };
              if (typeof m.context_length === "number") row.contextLength = m.context_length;
              if (typeof m.inputTokenLimit === "number") row.contextLength = m.inputTokenLimit;
              return row;
            })
            .filter((x): x is { id: string; name: string; contextLength?: number } => x !== null);

          setOpencodeLiveCatalog({ status: "ready", models: normalized, errorMessage: "" });
          return;
        }

        setOpencodeLiveCatalog({ status: "error", models: [], errorMessage: lastError });
      } catch (e) {
        if (cancelled) return;
        setOpencodeLiveCatalog({
          status: "error",
          models: [],
          errorMessage: e instanceof Error ? e.message : "fetch failed",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId, loading, isSearchProvider, sortedConnectionIds, shouldFetchProviderCatalog]);

  useEffect(() => {
    if (
      providerId !== "antigravity" &&
      providerId !== "claude" &&
      providerId !== "opencode-zen" &&
      providerId !== "opencode-go" &&
      providerId !== "kilocode" &&
      providerId !== "codex"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpencodeLiveCatalog({ status: "idle", models: [], errorMessage: "" });
    }
  }, [providerId]);

  useEffect(() => {
    if (loading || isSearchProvider) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProviderModelMeta();
  }, [loading, isSearchProvider, fetchProviderModelMeta]);

  return {
    modelMeta,
    syncedAvailableModels,
    opencodeLiveCatalog,
    models,
    registryModels,
    syncedModels,
    setOpencodeLiveCatalog,
    fetchProviderModelMeta,
  };
}
