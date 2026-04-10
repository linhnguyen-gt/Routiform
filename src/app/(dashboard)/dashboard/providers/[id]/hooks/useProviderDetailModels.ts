import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  syncedAvailableModels: any[];
  opencodeLiveCatalog: {
    status: "idle" | "loading" | "ready" | "no_connection" | "error";
    models: Array<{ id: string; name: string; contextLength?: number }>;
    errorMessage: string;
  };
  models: Array<{ id: string; name: string; contextLength?: number }>;
  registryModels: Array<{ id: string; name: string }>;
  syncedModels: Array<{ id: string; name: string }>;
  fetchProviderModelMeta: () => Promise<void>;
}

function dedupeModelsById<T extends { id: string; name: string }>(models: T[]): T[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
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
  const [syncedAvailableModels, setSyncedAvailableModels] = useState<any[]>([]);
  const [opencodeLiveCatalog, setOpencodeLiveCatalog] = useState<{
    status: "idle" | "loading" | "ready" | "no_connection" | "error";
    models: Array<{ id: string; name: string; contextLength?: number }>;
    errorMessage: string;
  }>({ status: "idle", models: [], errorMessage: "" });

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
    if (providerId === "gemini") return dedupeModelsById(syncedAvailableModels);
    if (isLiveCatalogProvider) {
      if (opencodeLiveCatalog.status === "ready" && opencodeLiveCatalog.models.length > 0) {
        return dedupeModelsById(opencodeLiveCatalog.models);
      }
      return dedupeModelsById(registryModels);
    }
    if (syncedModels.length > 0) return syncedModels;
    return dedupeModelsById(registryModels);
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

  useEffect(() => {
    if (!isLiveCatalogProvider || loading || isSearchProvider) return;

    const primaryId = sortedConnectionIds[0];
    if (!primaryId) {
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
      try {
        const res = await fetch(`/api/providers/${encodeURIComponent(primaryId)}/models`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const msg = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
          setOpencodeLiveCatalog({ status: "error", models: [], errorMessage: msg });
          return;
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
  }, [providerId, loading, isSearchProvider, sortedConnectionIds, isLiveCatalogProvider]);

  useEffect(() => {
    if (providerId !== "opencode-zen" && providerId !== "kilocode" && providerId !== "codex") {
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
    fetchProviderModelMeta,
  };
}
