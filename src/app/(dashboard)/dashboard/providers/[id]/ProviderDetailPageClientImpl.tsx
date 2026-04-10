"use client";

import { getCompatibleFallbackModels } from "@/lib/providers/managedAvailableModels";
import { supportsProviderModelAutoSync } from "@/shared/utils/providerAutoSync";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  CursorAuthModal,
  Input,
  KiroOAuthWrapper,
  Modal,
  OAuthModal,
  ProxyConfigModal,
  Select,
  Toggle,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MODEL_COMPAT_PROTOCOL_KEYS } from "@/shared/constants/modelCompat";
import { getModelsByProviderId } from "@/shared/constants/models";
import {
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  getProviderAlias,
  isAnthropicCompatibleProvider,
  isClaudeCodeCompatibleProvider,
  isOpenAICompatibleProvider,
  supportsApiKeyOnFreeProvider,
} from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { cn } from "@/shared/utils/cn";
import { resolveManagedModelAlias } from "@/shared/utils/providerModelAliases";
import { useNotificationStore } from "@/store/notificationStore";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ProviderDetailConnectionRow } from "../components/ProviderDetailConnectionRow";
import { ProviderDetailAddApiKeyModal } from "../components/ProviderDetailAddApiKeyModal";
import { ProviderDetailBatchTestResultsModal } from "../components/ProviderDetailBatchTestResultsModal";
import { ProviderDetailEditCompatibleNodeModal } from "../components/ProviderDetailEditCompatibleNodeModal";
import { ProviderDetailEditConnectionModal } from "../components/ProviderDetailEditConnectionModal";
import { ModelCompatPopover } from "../components/ModelCompatPopover";
import { ModelRow } from "../components/ProviderDetailModelRow";
import { PassthroughModelRow } from "../components/ProviderDetailPassthroughModelRow";
import { PassthroughModelsSection } from "../components/ProviderDetailPassthroughModelsSection";
import { CustomModelsSection } from "../components/ProviderDetailCustomModelsSection";
import { CompatibleModelsSection } from "../components/ProviderDetailCompatibleModelsSection";
import { formatProviderModelsErrorResponse } from "../providerDetailApiUtils";
import {
  CC_COMPATIBLE_DEFAULT_CHAT_PATH,
  CC_COMPATIBLE_DETAILS_TITLE,
  CC_COMPATIBLE_LABEL,
  anyNoPreserveCompatBadge,
  anyNormalizeCompatBadge,
  anyUpstreamHeadersBadge,
  buildCompatMap,
  effectiveNormalizeForProtocol,
  effectivePreserveForProtocol,
  effectiveUpstreamHeadersForProtocol,
} from "../providerDetailCompatUtils";
import { normalizeCodexLimitPolicy } from "../providerDetailCompatViewUtils";
import { useProviderDetailSelection } from "./hooks/useProviderDetailSelection";
import type { CompatModelMap, CompatModelRow, ModelCompatSavePatch } from "./types";
import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
export function ProviderDetailPageClientImpl() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providerNode, setProviderNode] = useState(null);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [retestingId, setRetestingId] = useState(null);
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchTestResults, setBatchTestResults] = useState<any>(null);
  const [modelAliases, setModelAliases] = useState({});
  const [headerImgError, setHeaderImgError] = useState(false);

  useEffect(() => {
    setHeaderImgError(false);
  }, [providerId]);
  const { copied, copy } = useCopyToClipboard();
  const t = useTranslations("providers");
  const notify = useNotificationStore();
  const [proxyTarget, setProxyTarget] = useState(null);
  const [proxyConfig, setProxyConfig] = useState(null);
  const [connProxyMap, setConnProxyMap] = useState<
    Record<string, { proxy: any; level: string } | null>
  >({});
  const [modelTestResults, setModelTestResults] = useState<Record<string, "ok" | "error">>({});
  const [testingModelKey, setTestingModelKey] = useState<string | null>(null);
  const [modelTestBannerError, setModelTestBannerError] = useState("");
  const modelTestInFlightRef = useRef(false);
  const selectAllConnectionsRef = useRef<HTMLInputElement>(null);
  const [bulkDeletingConnections, setBulkDeletingConnections] = useState(false);
  const [modelMeta, setModelMeta] = useState<{
    customModels: CompatModelRow[];
    modelCompatOverrides: Array<CompatModelRow & { id: string }>;
  }>({ customModels: [], modelCompatOverrides: [] });
  const [syncedAvailableModels, setSyncedAvailableModels] = useState<any[]>([]);
  /** Providers with live catalog from GET /api/providers/:id/models. */
  const [opencodeLiveCatalog, setOpencodeLiveCatalog] = useState<{
    status: "idle" | "loading" | "ready" | "no_connection" | "error";
    models: Array<{ id: string; name: string; contextLength?: number }>;
    errorMessage: string;
  }>({ status: "idle", models: [], errorMessage: "" });
  const [compatSavingModelId, setCompatSavingModelId] = useState<string | null>(null);
  const [applyingCodexAuthId, setApplyingCodexAuthId] = useState<string | null>(null);
  const [exportingCodexAuthId, setExportingCodexAuthId] = useState<string | null>(null);
  const autoSyncBootstrappedRef = useRef<Set<string>>(new Set());
  const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
  const isCcCompatible = isClaudeCodeCompatibleProvider(providerId);
  const isAnthropicCompatible =
    isAnthropicCompatibleProvider(providerId) && !isClaudeCodeCompatibleProvider(providerId);
  const isCompatible = isOpenAICompatible || isAnthropicCompatible || isCcCompatible;
  const isAnthropicProtocolCompatible = isAnthropicCompatible || isCcCompatible;

  const providerInfo = providerNode
    ? {
        id: providerNode.id,
        name:
          providerNode.name ||
          (isCcCompatible
            ? CC_COMPATIBLE_LABEL
            : providerNode.type === "anthropic-compatible"
              ? t("anthropicCompatibleName")
              : t("openaiCompatibleName")),
        color: isCcCompatible
          ? "#B45309"
          : providerNode.type === "anthropic-compatible"
            ? "#D97757"
            : "#10A37F",
        textIcon: isCcCompatible
          ? "CC"
          : providerNode.type === "anthropic-compatible"
            ? "AC"
            : "OC",
        apiType: providerNode.apiType,
        baseUrl: providerNode.baseUrl,
        type: providerNode.type,
      }
    : (FREE_PROVIDERS as any)[providerId] ||
      (OAUTH_PROVIDERS as any)[providerId] ||
      (APIKEY_PROVIDERS as any)[providerId];
  const providerSupportsOAuth =
    !!(FREE_PROVIDERS as any)[providerId] || !!(OAUTH_PROVIDERS as any)[providerId];
  const providerSupportsPat = supportsApiKeyOnFreeProvider(providerId);
  const isOAuth = providerSupportsOAuth && !providerSupportsPat;
  const allowQoderOAuthUi = providerId !== "qoder";
  const providerAlias = getProviderAlias(providerId);
  const isManagedAvailableModelsProvider = isCompatible || providerId === "openrouter";
  const isSearchProvider = providerId.endsWith("-search");
  const supportsAutoSync = supportsProviderModelAutoSync(providerId);

  const providerStorageAlias = isCompatible ? providerId : providerAlias;
  const providerDisplayAlias = isCompatible ? providerNode?.prefix || providerId : providerAlias;

  const sortedConnectionIds = useMemo(
    () =>
      [...connections]
        .sort(
          (a: { priority?: number }, b: { priority?: number }) =>
            (a.priority || 0) - (b.priority || 0)
        )
        .map((c: { id?: string }) => c.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [connections]
  );

  const {
    selectedConnectionIds,
    setSelectedConnectionIds,
    toggleConnectionBulkSelect,
    toggleSelectAllConnections,
  } = useProviderDetailSelection({
    connections,
    sortedConnectionIds,
    selectAllRef: selectAllConnectionsRef,
  });

  const registryModels = useMemo(() => getModelsByProviderId(providerId), [providerId]);
  /** Live catalog providers use connection-specific /models instead of static registry models. */
  const isLiveCatalogProvider =
    providerId === "opencode-zen" || providerId === "kilocode" || providerId === "codex";
  const syncedModels = useMemo(
    () =>
      (modelMeta.customModels || [])
        .filter((m) => m?.id && (m.source || "manual") !== "manual")
        .map((m) => ({ id: m.id as string, name: (m.name as string) || (m.id as string) })),
    [modelMeta.customModels]
  );
  // Gemini: synced DB list. Live catalog providers: remote list via connection API.
  const models = useMemo(() => {
    if (providerId === "gemini") return syncedAvailableModels;
    if (isLiveCatalogProvider) {
      if (opencodeLiveCatalog.status === "ready" && opencodeLiveCatalog.models.length > 0) {
        return opencodeLiveCatalog.models;
      }
      return registryModels;
    }
    if (syncedModels.length > 0) return syncedModels;
    return registryModels;
  }, [
    providerId,
    syncedAvailableModels,
    registryModels,
    opencodeLiveCatalog,
    isLiveCatalogProvider,
    syncedModels,
  ]);

  useEffect(() => {
    if (!isLiveCatalogProvider || loading || isSearchProvider) return;

    const primaryId = sortedConnectionIds[0];
    if (!primaryId) {
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
      setOpencodeLiveCatalog({ status: "idle", models: [], errorMessage: "" });
    }
  }, [providerId]);

  // Define callbacks BEFORE the useEffect that uses them
  const fetchAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) {
        setModelAliases(data.aliases || {});
      }
    } catch (error) {
      console.log("Error fetching aliases:", error);
    }
  }, []);

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

  const fetchConnections = useCallback(async () => {
    try {
      const [connectionsRes, nodesRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();
      if (connectionsRes.ok) {
        const filtered = (connectionsData.connections || []).filter(
          (c) => c.provider === providerId
        );
        setConnections(filtered);
      }
      if (nodesRes.ok) {
        let node = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;

        // Newly created compatible nodes can be briefly unavailable on one worker.
        // Retry a few times before showing "Provider not found".
        if (!node && isCompatible) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            const retryRes = await fetch("/api/provider-nodes", { cache: "no-store" });
            if (!retryRes.ok) continue;
            const retryData = await retryRes.json();
            node = (retryData.nodes || []).find((entry) => entry.id === providerId) || null;
            if (node) break;
          }
        }

        setProviderNode(node);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  }, [providerId, isCompatible]);

  const handleUpdateNode = async (formData) => {
    try {
      const res = await fetch(`/api/provider-nodes/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setProviderNode(data.node);
        await fetchConnections();
        setShowEditNodeModal(false);
      }
    } catch (error) {
      console.log("Error updating provider node:", error);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchAliases();
    // Load proxy config for visual indicators (provider-level button)
    fetch("/api/settings/proxy")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setProxyConfig(c))
      .catch(() => {});
  }, [fetchConnections, fetchAliases]);

  const loadConnProxies = useCallback(async (conns: { id?: string }[]) => {
    if (!conns.length) return;
    try {
      const results = await Promise.all(
        conns
          .filter((c) => c.id)
          .map((c) =>
            fetch(`/api/settings/proxy?resolve=${encodeURIComponent(c.id!)}`, { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => [c.id!, data] as [string, any])
              .catch(() => [c.id!, null] as [string, any])
          )
      );
      const map: Record<string, { proxy: any; level: string } | null> = {};
      for (const [id, data] of results) {
        map[id] = data?.proxy ? data : null;
      }
      setConnProxyMap(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (loading || isSearchProvider) return;
    fetchProviderModelMeta();
  }, [loading, isSearchProvider, fetchProviderModelMeta]);

  // Load per-connection effective proxy (handles registry assignments)
  useEffect(() => {
    if (!loading && connections.length > 0) {
      void loadConnProxies(connections);
    }
  }, [loading, connections, loadConnProxies]);

  const handleSetAlias = async (modelId, alias, providerAliasOverride = providerAlias) => {
    const fullModel = `${providerAliasOverride}/${modelId}`;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, alias }),
      });
      if (res.ok) {
        await fetchAliases();
      } else {
        const data = await res.json();
        alert(data.error || t("failedSetAlias"));
      }
    } catch (error) {
      console.log("Error setting alias:", error);
    }
  };

  const handleDeleteAlias = async (alias) => {
    try {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchAliases();
      }
    } catch (error) {
      console.log("Error deleting alias:", error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t("deleteConnectionConfirm"))) return;
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConnections(connections.filter((c) => c.id !== id));
        setSelectedConnectionIds((prev) => prev.filter((x) => x !== id));
        // Refresh model list after connection deletion (synced models may change)
        if (providerId === "gemini") {
          await fetchProviderModelMeta();
        }
      }
    } catch (error) {
      console.log("Error deleting connection:", error);
    }
  };

  const handleBulkDeleteConnections = useCallback(async () => {
    const ids = selectedConnectionIds.filter((id) => sortedConnectionIds.includes(id));
    if (!ids.length) return;
    if (!confirm(t("bulkDeleteConnectionsConfirm", { count: ids.length }))) return;
    setBulkDeletingConnections(true);
    const deleted: string[] = [];
    try {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) deleted.push(id);
        } catch {
          // continue with other ids
        }
      }
      setConnections((prev) => prev.filter((c: { id?: string }) => !deleted.includes(c.id!)));
      setSelectedConnectionIds((prev) => prev.filter((id) => !deleted.includes(id)));
      if (providerId === "gemini" && deleted.length > 0) {
        try {
          await fetchProviderModelMeta();
        } catch {
          /* non-critical */
        }
      }
      if (deleted.length === ids.length) {
        notify.success(t("bulkDeleteConnectionsSuccess", { count: deleted.length }));
      } else if (deleted.length > 0) {
        notify.error(
          t("bulkDeleteConnectionsPartial", { removed: deleted.length, total: ids.length })
        );
      } else {
        notify.error(t("bulkDeleteConnectionsNone"));
      }
    } finally {
      setBulkDeletingConnections(false);
    }
  }, [
    selectedConnectionIds,
    sortedConnectionIds,
    t,
    notify,
    providerId,
    fetchProviderModelMeta,
    setSelectedConnectionIds,
  ]);

  const handleOAuthSuccess = useCallback(() => {
    fetchConnections();
    setShowOAuthModal(false);
  }, [fetchConnections]);

  const handleTestModel = useCallback(
    async (fullModel: string): Promise<boolean> => {
      if (modelTestInFlightRef.current) return false;
      if (!connections.length) {
        notify.error(t("addConnectionToImport"));
        return false;
      }
      modelTestInFlightRef.current = true;
      setTestingModelKey(fullModel);
      setModelTestBannerError("");
      let success = false;
      try {
        const activeConnectionId = connections.find((conn: any) => conn.isActive !== false)?.id;
        const request =
          providerId === "openrouter" && activeConnectionId
            ? {
                url: `/api/providers/${encodeURIComponent(activeConnectionId)}/test`,
                body: JSON.stringify({
                  validationModelId: fullModel.startsWith(`${providerDisplayAlias}/`)
                    ? fullModel.slice(providerDisplayAlias.length + 1)
                    : fullModel,
                }),
                fromConnectionTest: true,
              }
            : {
                url: "/api/models/test",
                body: JSON.stringify({ model: fullModel }),
                fromConnectionTest: false,
              };

        const res = await fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request.body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          valid?: boolean;
          latencyMs?: number;
          error?: string;
        };
        const ok = request.fromConnectionTest ? Boolean(data.valid) : Boolean(data.ok);
        success = ok;
        setModelTestResults((prev) => ({ ...prev, [fullModel]: ok ? "ok" : "error" }));
        if (ok) {
          setModelTestBannerError("");
          const ms = typeof data.latencyMs === "number" ? data.latencyMs : null;
          notify.success(ms != null ? t("modelTestOk", { ms }) : t("testSuccess"));
        } else {
          const err =
            typeof data.error === "string" && data.error.length > 0 ? data.error : t("testFailed");
          setModelTestBannerError(err);
          notify.error(err);
        }
      } catch {
        setModelTestResults((prev) => ({ ...prev, [fullModel]: "error" }));
        const netErr = t("errorTypeNetworkError");
        setModelTestBannerError(netErr);
        notify.error(netErr);
        success = false;
      } finally {
        modelTestInFlightRef.current = false;
        setTestingModelKey(null);
      }
      return success;
    },
    [connections, notify, providerDisplayAlias, providerId, t]
  );

  const openPrimaryAddFlow = useCallback(() => {
    if (isOAuth) {
      setShowOAuthModal(true);
      return;
    }
    setShowAddApiKeyModal(true);
  }, [isOAuth]);

  const handleSaveApiKey = async (formData) => {
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, ...formData }),
      });
      if (res.ok) {
        const connectionData = await res.json();
        const newConnection = connectionData?.connection;
        await fetchConnections();
        setShowAddApiKeyModal(false);

        if (newConnection?.id && supportsAutoSync) {
          try {
            await fetch(`/api/providers/${newConnection.id}/sync-models`, {
              method: "POST",
              signal: AbortSignal.timeout(30_000),
            });
            await fetchProviderModelMeta();
          } catch {
            // non-blocking: scheduler will retry later
          }
        }
        return null;
      }
      const data = await res.json().catch(() => ({}));
      const errorMsg = data.error?.message || data.error || t("failedSaveConnection");
      return errorMsg;
    } catch (error) {
      console.log("Error saving connection:", error);
      return t("failedSaveConnectionRetry");
    }
  };

  const handleUpdateConnection = async (formData) => {
    try {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchConnections();
        setShowEditModal(false);
        return null;
      }
      const data = await res.json().catch(() => ({}));
      return data.error?.message || data.error || t("failedSaveConnection");
    } catch (error) {
      console.log("Error updating connection:", error);
      return t("failedSaveConnectionRetry");
    }
  };

  const handleUpdateConnectionStatus = async (id, isActive) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
      }
    } catch (error) {
      console.log("Error updating connection status:", error);
    }
  };

  const handleToggleRateLimit = async (connectionId, enabled) => {
    try {
      const res = await fetch("/api/rate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, enabled }),
      });
      if (res.ok) {
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, rateLimitProtection: enabled } : c))
        );
      }
    } catch (error) {
      console.error("Error toggling rate limit:", error);
    }
  };

  const handleToggleCodexLimit = async (connectionId, field, enabled) => {
    try {
      const target = connections.find((connection) => connection.id === connectionId);
      if (!target) return;

      const providerSpecificData =
        target.providerSpecificData && typeof target.providerSpecificData === "object"
          ? target.providerSpecificData
          : {};
      const existingPolicy =
        providerSpecificData.codexLimitPolicy &&
        typeof providerSpecificData.codexLimitPolicy === "object"
          ? providerSpecificData.codexLimitPolicy
          : {};

      const nextPolicy = {
        ...normalizeCodexLimitPolicy(existingPolicy),
        [field]: enabled,
      };

      const res = await fetch(`/api/providers/${connectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSpecificData: {
            ...providerSpecificData,
            codexLimitPolicy: nextPolicy,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || "Failed to update Codex limit policy");
        return;
      }

      setConnections((prev) =>
        prev.map((connection) =>
          connection.id === connectionId
            ? {
                ...connection,
                providerSpecificData: {
                  ...(connection.providerSpecificData || {}),
                  codexLimitPolicy: nextPolicy,
                },
              }
            : connection
        )
      );
      notify.success("Codex limit policy updated");
    } catch (error) {
      console.error("Error toggling Codex quota policy:", error);
      notify.error("Failed to update Codex limit policy");
    }
  };

  const handleRetestConnection = async (connectionId) => {
    if (!connectionId || retestingId) return;
    setRetestingId(connectionId);
    try {
      const res = await fetch(`/api/providers/${connectionId}/test`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || t("failedRetestConnection"));
        return;
      }
      await fetchConnections();
    } catch (error) {
      console.error("Error retesting connection:", error);
    } finally {
      setRetestingId(null);
    }
  };

  // Batch test all connections for this provider
  const handleBatchTestAll = async () => {
    if (batchTesting || connections.length === 0) return;
    setBatchTesting(true);
    setBatchTestResults(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2min max
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "provider", providerId }),
        signal: controller.signal,
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        data = { error: t("providerTestFailed"), results: [], summary: null };
      }
      setBatchTestResults({
        ...data,
        error: data.error
          ? typeof data.error === "object"
            ? data.error.message || data.error.error || JSON.stringify(data.error)
            : String(data.error)
          : null,
      });
      if (data?.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(t("allTestsPassed", { total }));
        else notify.warning(t("testSummary", { passed, failed, total }));
      }
      // Refresh connections to update statuses
      await fetchConnections();
    } catch (error: any) {
      const isAbort = error?.name === "AbortError";
      const msg = isAbort ? t("providerTestTimeout") : t("providerTestFailed");
      setBatchTestResults({ error: msg, results: [], summary: null });
      notify.error(msg);
    } finally {
      clearTimeout(timeoutId);
      setBatchTesting(false);
    }
  };

  // T12: Manual token refresh
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const parseApiErrorMessage = async (res: Response, fallback: string) => {
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      if (typeof data?.error === "string" && data.error.trim()) {
        return data.error;
      }
      if (data?.error?.message) {
        return data.error.message;
      }
    }

    const text = await res.text().catch(() => "");
    return text.trim() || fallback;
  };

  const getAttachmentFilename = (res: Response, fallback: string) => {
    const disposition = res.headers.get("content-disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const plainMatch = disposition.match(/filename="([^"]+)"/i);
    if (plainMatch?.[1]) {
      return plainMatch[1];
    }

    return fallback;
  };

  const handleRefreshToken = async (connectionId: string) => {
    if (refreshingId) return;
    setRefreshingId(connectionId);
    try {
      const res = await fetch(`/api/providers/${connectionId}/refresh`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        notify.success(t("tokenRefreshed"));
        await fetchConnections();
      } else {
        notify.error(data.error || t("tokenRefreshFailed"));
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
      notify.error(t("tokenRefreshFailed"));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleApplyCodexAuthLocal = async (connectionId: string) => {
    if (applyingCodexAuthId) return;
    setApplyingCodexAuthId(connectionId);

    const defaultSuccess =
      typeof t.has === "function" && t.has("codexAuthAppliedLocal")
        ? t("codexAuthAppliedLocal")
        : "Codex auth.json applied locally";
    const defaultError =
      typeof t.has === "function" && t.has("codexAuthApplyFailed")
        ? t("codexAuthApplyFailed")
        : "Failed to apply Codex auth.json locally";

    try {
      const res = await fetch(`/api/providers/${connectionId}/codex-auth/apply-local`, {
        method: "POST",
      });

      if (!res.ok) {
        notify.error(await parseApiErrorMessage(res, defaultError));
        return;
      }

      notify.success(defaultSuccess);
    } catch (error) {
      console.error("Error applying Codex auth locally:", error);
      notify.error(defaultError);
    } finally {
      setApplyingCodexAuthId(null);
    }
  };

  const handleExportCodexAuthFile = async (connectionId: string) => {
    if (exportingCodexAuthId) return;
    setExportingCodexAuthId(connectionId);

    const defaultSuccess =
      typeof t.has === "function" && t.has("codexAuthExported")
        ? t("codexAuthExported")
        : "Codex auth.json exported";
    const defaultError =
      typeof t.has === "function" && t.has("codexAuthExportFailed")
        ? t("codexAuthExportFailed")
        : "Failed to export Codex auth.json";

    try {
      const res = await fetch(`/api/providers/${connectionId}/codex-auth/export`, {
        method: "POST",
      });

      if (!res.ok) {
        notify.error(await parseApiErrorMessage(res, defaultError));
        return;
      }

      const blob = await res.blob();
      const filename = getAttachmentFilename(res, "codex-auth.json");
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);

      notify.success(defaultSuccess);
    } catch (error) {
      console.error("Error exporting Codex auth file:", error);
      notify.error(defaultError);
    } finally {
      setExportingCodexAuthId(null);
    }
  };

  const handleSwapPriority = async (conn1, conn2) => {
    if (!conn1 || !conn2) return;
    try {
      // If they have the same priority, we need to ensure the one moving up
      // gets a lower value than the one moving down.
      // We use a small offset which the backend re-indexing will fix.
      let p1 = conn2.priority;
      let p2 = conn1.priority;

      if (p1 === p2) {
        // If moving conn1 "up" (index decreases)
        const isConn1MovingUp = connections.indexOf(conn1) > connections.indexOf(conn2);
        if (isConn1MovingUp) {
          p1 = conn2.priority - 0.5;
        } else {
          p1 = conn2.priority + 0.5;
        }
      }

      await Promise.all([
        fetch(`/api/providers/${conn1.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: p1 }),
        }),
        fetch(`/api/providers/${conn2.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: p2 }),
        }),
      ]);
      await fetchConnections();
    } catch (error) {
      console.log("Error swapping priority:", error);
    }
  };

  const canImportModels = connections.some((conn) => conn.isActive !== false);

  // Auto-sync toggle state: read from first active connection's providerSpecificData
  const autoSyncConnection = connections.find((conn: any) => conn.isActive !== false);
  const rawAutoSync = (autoSyncConnection as any)?.providerSpecificData?.autoSync;
  const isAutoSyncEnabled = supportsAutoSync && rawAutoSync !== false;
  const [togglingAutoSync, setTogglingAutoSync] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);

  const handleToggleAutoSync = async () => {
    if (!autoSyncConnection || togglingAutoSync || !supportsAutoSync) return;
    setTogglingAutoSync(true);
    try {
      const newValue = !isAutoSyncEnabled;
      const existingPsd =
        (autoSyncConnection as any).providerSpecificData &&
        typeof (autoSyncConnection as any).providerSpecificData === "object"
          ? (autoSyncConnection as any).providerSpecificData
          : {};
      await fetch(`/api/providers/${(autoSyncConnection as any).id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSpecificData: { ...existingPsd, autoSync: newValue },
        }),
      });
      await fetchConnections();
      notify[newValue ? "success" : "info"](
        newValue ? t("autoSyncEnabled") : t("autoSyncDisabled")
      );
    } catch (error) {
      console.log("Error toggling auto-sync:", error);
      notify.error(t("autoSyncToggleFailed"));
    } finally {
      setTogglingAutoSync(false);
    }
  };

  const handleRefreshModels = async () => {
    if (!autoSyncConnection || refreshingModels || !supportsAutoSync) return;
    setRefreshingModels(true);
    try {
      if (isLiveCatalogProvider) {
        const res = await fetch(
          `/api/providers/${encodeURIComponent(autoSyncConnection.id)}/models`,
          {
            cache: "no-store",
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
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
      } else {
        const res = await fetch(
          `/api/providers/${encodeURIComponent(autoSyncConnection.id)}/sync-models`,
          {
            method: "POST",
            signal: AbortSignal.timeout(30_000),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
        }
      }

      await fetchProviderModelMeta();
      notify.success("Models refreshed");
    } catch (error) {
      console.log("Error refreshing models:", error);
      notify.error(error instanceof Error ? error.message : t("failedFetchModels"));
    } finally {
      setRefreshingModels(false);
    }
  };

  useEffect(() => {
    if (loading || !supportsAutoSync || !isAutoSyncEnabled) return;
    const activeConnection = connections.find((conn: any) => conn.isActive !== false);
    if (!activeConnection?.id) return;

    const bootstrapKey = String(activeConnection.id);
    if (autoSyncBootstrappedRef.current.has(bootstrapKey)) return;

    const hasSyncedModels =
      syncedModels.length > 0 ||
      (providerId === "gemini" && syncedAvailableModels.length > 0) ||
      (isLiveCatalogProvider &&
        opencodeLiveCatalog.status === "ready" &&
        opencodeLiveCatalog.models.length > 0);

    if (hasSyncedModels) {
      autoSyncBootstrappedRef.current.add(bootstrapKey);
      return;
    }

    autoSyncBootstrappedRef.current.add(bootstrapKey);
    void fetch(`/api/providers/${encodeURIComponent(bootstrapKey)}/sync-models`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    })
      .then(() => fetchProviderModelMeta())
      .catch(() => {
        autoSyncBootstrappedRef.current.delete(bootstrapKey);
      });
  }, [
    loading,
    supportsAutoSync,
    isAutoSyncEnabled,
    connections,
    syncedModels,
    providerId,
    syncedAvailableModels,
    isLiveCatalogProvider,
    opencodeLiveCatalog,
    fetchProviderModelMeta,
  ]);

  const [clearingModels, setClearingModels] = useState(false);
  const providerAliasEntries = useMemo(
    () =>
      Object.entries(modelAliases).filter(([, model]) =>
        (model as string).startsWith(`${providerStorageAlias}/`)
      ),
    [modelAliases, providerStorageAlias]
  );

  const handleClearAllModels = async () => {
    if (clearingModels) return;
    if (!confirm(t("clearAllModelsConfirm"))) return;
    setClearingModels(true);
    try {
      const res = await fetch(
        `/api/provider-models?provider=${encodeURIComponent(providerStorageAlias)}&all=true`,
        { method: "DELETE" }
      );
      if (res.ok) {
        // Also delete all aliases that belong to this provider
        await Promise.all(
          providerAliasEntries.map(([alias]) =>
            fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, {
              method: "DELETE",
            }).catch(() => {})
          )
        );
        await fetchProviderModelMeta();
        await fetchAliases();
        notify.success(t("clearAllModelsSuccess"));
      } else {
        notify.error(t("clearAllModelsFailed"));
      }
    } catch {
      notify.error(t("clearAllModelsFailed"));
    } finally {
      setClearingModels(false);
    }
  };

  const customMap = useMemo(() => buildCompatMap(modelMeta.customModels), [modelMeta.customModels]);
  const overrideMap = useMemo(
    () => buildCompatMap(modelMeta.modelCompatOverrides),
    [modelMeta.modelCompatOverrides]
  );
  const compatibleFallbackModels = useMemo(
    () => getCompatibleFallbackModels(providerId, modelMeta.customModels),
    [providerId, modelMeta.customModels]
  );

  const effectiveModelNormalize = (modelId: string, protocol = MODEL_COMPAT_PROTOCOL_KEYS[0]) =>
    effectiveNormalizeForProtocol(modelId, protocol, customMap, overrideMap);

  const effectiveModelPreserveDeveloper = (
    modelId: string,
    protocol = MODEL_COMPAT_PROTOCOL_KEYS[0]
  ) => effectivePreserveForProtocol(modelId, protocol, customMap, overrideMap);

  const getUpstreamHeadersRecordForModel = useCallback(
    (modelId: string, protocol: string) =>
      effectiveUpstreamHeadersForProtocol(modelId, protocol, customMap, overrideMap),
    [customMap, overrideMap]
  );

  const saveModelCompatFlags = async (modelId: string, patch: ModelCompatSavePatch) => {
    setCompatSavingModelId(modelId);
    try {
      const c = customMap.get(modelId) as Record<string, unknown> | undefined;
      let body: Record<string, unknown>;
      const onlyCompatByProtocol =
        patch.compatByProtocol &&
        patch.normalizeToolCallId === undefined &&
        patch.preserveOpenAIDeveloperRole === undefined &&
        !("upstreamHeaders" in patch);

      if (c) {
        if (onlyCompatByProtocol) {
          body = {
            provider: providerId,
            modelId,
            compatByProtocol: patch.compatByProtocol,
          };
        } else {
          body = {
            provider: providerId,
            modelId,
            modelName: (c.name as string) || modelId,
            source: (c.source as string) || "manual",
            apiFormat: (c.apiFormat as string) || "chat-completions",
            supportedEndpoints:
              Array.isArray(c.supportedEndpoints) && (c.supportedEndpoints as unknown[]).length
                ? c.supportedEndpoints
                : ["chat"],
            normalizeToolCallId:
              patch.normalizeToolCallId !== undefined
                ? patch.normalizeToolCallId
                : Boolean(c.normalizeToolCallId),
            preserveOpenAIDeveloperRole:
              patch.preserveOpenAIDeveloperRole !== undefined
                ? patch.preserveOpenAIDeveloperRole
                : Object.prototype.hasOwnProperty.call(c, "preserveOpenAIDeveloperRole")
                  ? Boolean(c.preserveOpenAIDeveloperRole)
                  : true,
          };
          if (patch.compatByProtocol) body.compatByProtocol = patch.compatByProtocol;
        }
      } else {
        body = { provider: providerId, modelId, ...patch };
      }
      const res = await fetch("/api/provider-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await formatProviderModelsErrorResponse(res);
        notify.error(
          detail ? `${t("failedSaveCustomModel")} — ${detail}` : t("failedSaveCustomModel")
        );
        return;
      }
    } catch {
      notify.error(t("failedSaveCustomModel"));
      return;
    } finally {
      setCompatSavingModelId(null);
    }
    try {
      await fetchProviderModelMeta();
    } catch {
      /* refresh failure is non-critical — data was already saved */
    }
  };

  const renderModelsSection = () => {
    const modelTestBanner = modelTestBannerError ? (
      <p className="mb-3 break-words text-xs text-red-500">{modelTestBannerError}</p>
    ) : null;

    if (isLiveCatalogProvider) {
      if (opencodeLiveCatalog.status === "idle" || opencodeLiveCatalog.status === "loading") {
        return (
          <div>
            {modelTestBanner}
            <p className="text-sm text-text-muted">{t("fetchingModels")}</p>
          </div>
        );
      }
      if (opencodeLiveCatalog.status === "no_connection") {
        return (
          <div>
            {modelTestBanner}
            <p className="text-sm text-text-muted">{t("addConnectionToImport")}</p>
          </div>
        );
      }
      if (opencodeLiveCatalog.status === "error") {
        return (
          <div>
            {modelTestBanner}
            <p className="mb-3 break-words text-xs text-red-500">
              {t("failedFetchModels")}: {opencodeLiveCatalog.errorMessage}
            </p>
          </div>
        );
      }
    }

    const autoSyncToggle = canImportModels && (
      <button
        onClick={handleToggleAutoSync}
        disabled={togglingAutoSync || !supportsAutoSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-transparent cursor-pointer text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
        title={supportsAutoSync ? t("autoSyncTooltip") : "Provider does not support model listing"}
      >
        <span
          className="material-symbols-outlined text-[16px]"
          style={{ color: isAutoSyncEnabled ? "#22c55e" : "var(--color-text-muted)" }}
        >
          {isAutoSyncEnabled ? "toggle_on" : "toggle_off"}
        </span>
        <span className="text-text-main">{t("autoSync")}</span>
      </button>
    );

    const refreshModelsButton = canImportModels && (
      <button
        onClick={handleRefreshModels}
        disabled={refreshingModels || !supportsAutoSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-transparent cursor-pointer text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          supportsAutoSync ? "Refresh available models" : "Provider does not support model listing"
        }
      >
        <span
          className={`material-symbols-outlined text-[16px] ${refreshingModels ? "animate-spin" : ""}`}
        >
          refresh
        </span>
        <span className="text-text-main">Refresh</span>
      </button>
    );

    const clearAllButton = (modelMeta.customModels.length > 0 ||
      providerAliasEntries.length > 0) && (
      <button
        onClick={handleClearAllModels}
        disabled={clearingModels}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 bg-transparent cursor-pointer text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        title={t("clearAllModels")}
      >
        <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
        <span>{t("clearAllModels")}</span>
      </button>
    );

    if (isManagedAvailableModelsProvider) {
      const description =
        providerId === "openrouter"
          ? t("openRouterAnyModelHint")
          : isCcCompatible
            ? "CC Compatible available models mirror the OAuth Claude Code provider list."
            : t("compatibleModelsDescription", {
                type: isAnthropicCompatible ? t("anthropic") : t("openai"),
              });
      const inputLabel = providerId === "openrouter" ? t("modelIdFromOpenRouter") : t("modelId");
      const inputPlaceholder =
        providerId === "openrouter"
          ? t("openRouterModelPlaceholder")
          : isCcCompatible
            ? "claude-sonnet-4-6"
            : isAnthropicCompatible
              ? t("anthropicCompatibleModelPlaceholder")
              : t("openaiCompatibleModelPlaceholder");

      return (
        <div>
          {modelTestBanner}
          <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
            {autoSyncToggle}
            {refreshModelsButton}
            {clearAllButton}
          </div>
          <CompatibleModelsSection
            providerStorageAlias={providerStorageAlias}
            providerDisplayAlias={providerDisplayAlias}
            modelAliases={modelAliases}
            fallbackModels={compatibleFallbackModels}
            description={description}
            inputLabel={inputLabel}
            inputPlaceholder={inputPlaceholder}
            copied={copied}
            onCopy={copy}
            onSetAlias={handleSetAlias}
            onDeleteAlias={handleDeleteAlias}
            connections={connections}
            isAnthropic={isAnthropicProtocolCompatible}
            t={t}
            effectiveModelNormalize={effectiveModelNormalize}
            effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
            getUpstreamHeadersRecord={getUpstreamHeadersRecordForModel}
            saveModelCompatFlags={saveModelCompatFlags}
            compatSavingModelId={compatSavingModelId}
            onModelsChanged={fetchProviderModelMeta}
            modelTestResults={modelTestResults}
            testingModelKey={testingModelKey}
            onTestModel={handleTestModel}
            canTestModels={connections.length > 0}
          />
        </div>
      );
    }

    if (providerInfo.passthroughModels) {
      return (
        <div>
          {modelTestBanner}
          <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
            {autoSyncToggle}
            {clearAllButton}
            {!canImportModels && (
              <span className="text-xs text-text-muted">{t("addConnectionToImport")}</span>
            )}
          </div>
          <PassthroughModelsSection
            providerAlias={providerAlias}
            modelAliases={modelAliases}
            copied={copied}
            onCopy={copy}
            onSetAlias={handleSetAlias}
            onDeleteAlias={handleDeleteAlias}
            t={t}
            effectiveModelNormalize={effectiveModelNormalize}
            effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
            getUpstreamHeadersRecord={getUpstreamHeadersRecordForModel}
            saveModelCompatFlags={saveModelCompatFlags}
            compatSavingModelId={compatSavingModelId}
            modelTestResults={modelTestResults}
            testingModelKey={testingModelKey}
            onTestModel={handleTestModel}
            canTestModels={connections.length > 0}
          />
        </div>
      );
    }

    const modelsToolbar = (
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
        {autoSyncToggle}
        {refreshModelsButton}
        {!canImportModels && (
          <span className="text-xs text-text-muted">{t("addConnectionToImport")}</span>
        )}
      </div>
    );

    if (models.length === 0) {
      return (
        <div>
          {modelTestBanner}
          {modelsToolbar}
          <p className="text-sm text-text-muted">{t("noModelsConfigured")}</p>
        </div>
      );
    }
    return (
      <div>
        {modelTestBanner}
        {modelsToolbar}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {models.map((model) => {
            const fullModel = `${providerDisplayAlias}/${model.id}`;
            return (
              <ModelRow
                key={model.id}
                model={model}
                fullModel={fullModel}
                copied={copied}
                onCopy={copy}
                t={t}
                showDeveloperToggle
                effectiveModelNormalize={effectiveModelNormalize}
                effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
                getUpstreamHeadersRecord={(p) => getUpstreamHeadersRecordForModel(model.id, p)}
                saveModelCompatFlags={saveModelCompatFlags}
                compatDisabled={compatSavingModelId === model.id}
                testStatus={modelTestResults[fullModel]}
                onTest={connections.length > 0 ? () => handleTestModel(fullModel) : undefined}
                isTesting={testingModelKey === fullModel}
              />
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!providerInfo) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center py-20">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-surface p-10 text-center shadow-sm">
          <span
            className="material-symbols-outlined mb-3 block text-4xl text-text-muted/80"
            aria-hidden
          >
            travel_explore
          </span>
          <p className="text-text-muted">{t("providerNotFound")}</p>
          <Link
            href="/dashboard/providers"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {t("backToProviders")}
          </Link>
        </div>
      </div>
    );
  }

  const headerIconTextFallback = (
    <span className="text-lg font-bold dark:!text-foreground" style={{ color: providerInfo.color }}>
      {providerInfo.textIcon || providerInfo.id.slice(0, 2).toUpperCase()}
    </span>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      {/* Hero */}
      <div>
        <Link
          href="/dashboard/providers"
          className="group mb-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted transition-colors duration-200 hover:text-primary"
        >
          <span className="material-symbols-outlined text-lg transition-transform duration-200 group-hover:-translate-x-0.5">
            arrow_back
          </span>
          {t("backToProviders")}
        </Link>
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface to-bg-subtle/35 p-6 shadow-sm ring-1 ring-black/[0.03] dark:to-white/[0.03] dark:ring-white/[0.06] sm:p-8">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.12] blur-3xl"
            style={{ backgroundColor: providerInfo.color }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <div className="flex shrink-0 justify-center sm:justify-start">
              <div className="relative">
                <div
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                  style={{ backgroundColor: `${providerInfo.color}18` }}
                >
                  {isOpenAICompatible && providerInfo.apiType ? (
                    headerImgError ? (
                      headerIconTextFallback
                    ) : (
                      <Image
                        src={
                          providerInfo.apiType === "responses"
                            ? "/providers/oai-r.png"
                            : "/providers/oai-cc.png"
                        }
                        alt={providerInfo.name}
                        width={48}
                        height={48}
                        className="max-h-[48px] max-w-[48px] rounded-lg object-contain"
                        sizes="48px"
                        onError={() => setHeaderImgError(true)}
                      />
                    )
                  ) : isAnthropicProtocolCompatible ? (
                    headerImgError ? (
                      headerIconTextFallback
                    ) : (
                      <Image
                        src="/providers/anthropic-m.png"
                        alt={providerInfo.name}
                        width={48}
                        height={48}
                        className="max-h-[48px] max-w-[48px] rounded-lg object-contain"
                        sizes="48px"
                        onError={() => setHeaderImgError(true)}
                      />
                    )
                  ) : (
                    <ProviderIcon
                      providerId={providerInfo.id}
                      size={48}
                      type="color"
                      className="text-foreground"
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              {providerInfo.website ? (
                <a
                  href={providerInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight hover:underline sm:justify-start sm:text-3xl dark:!text-foreground"
                  style={{ color: providerInfo.color }}
                >
                  {providerInfo.name}
                  <span className="material-symbols-outlined text-xl opacity-60 dark:opacity-70">
                    open_in_new
                  </span>
                </a>
              ) : (
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {providerInfo.name}
                </h1>
              )}
              <p className="mt-1 text-sm text-text-muted">
                {t("connectionCountLabel", { count: connections.length })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isCompatible && providerNode && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                {isCcCompatible
                  ? CC_COMPATIBLE_DETAILS_TITLE
                  : isAnthropicCompatible
                    ? t("anthropicCompatibleDetails")
                    : t("openaiCompatibleDetails")}
              </h2>
              <p className="text-sm text-text-muted">
                {isAnthropicProtocolCompatible
                  ? t("messagesApi")
                  : providerNode.apiType === "responses"
                    ? t("responsesApi")
                    : t("chatCompletions")}{" "}
                · {(providerNode.baseUrl || "").replace(/\/$/, "")}/
                {isCcCompatible
                  ? (providerNode.chatPath || CC_COMPATIBLE_DEFAULT_CHAT_PATH).replace(/^\//, "")
                  : isAnthropicCompatible
                    ? (providerNode.chatPath || "/messages").replace(/^\//, "")
                    : providerNode.apiType === "responses"
                      ? (providerNode.chatPath || "/responses").replace(/^\//, "")
                      : (providerNode.chatPath || "/chat/completions").replace(/^\//, "")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                icon="add"
                onClick={() => setShowAddApiKeyModal(true)}
                disabled={connections.length > 0}
              >
                {t("add")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="edit"
                onClick={() => setShowEditNodeModal(true)}
              >
                {t("edit")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="delete"
                onClick={async () => {
                  if (
                    !confirm(
                      t("deleteCompatibleNodeConfirm", {
                        type: isCcCompatible
                          ? CC_COMPATIBLE_LABEL
                          : isAnthropicCompatible
                            ? t("anthropic")
                            : t("openai"),
                      })
                    )
                  )
                    return;
                  try {
                    const res = await fetch(`/api/provider-nodes/${providerId}`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      router.push("/dashboard/providers");
                    }
                  } catch (error) {
                    console.log("Error deleting provider node:", error);
                  }
                }}
              >
                {t("delete")}
              </Button>
            </div>
          </div>
          {connections.length > 0 && (
            <p className="text-sm text-text-muted">{t("singleConnectionPerCompatible")}</p>
          )}
        </Card>
      )}

      {/* Connections */}
      <Card className="rounded-xl border-border/50 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span
              className="material-symbols-outlined hidden text-text-muted/70 sm:inline"
              aria-hidden
            >
              hub
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{t("connections")}</h2>
            {/* Provider-level proxy indicator/button */}
            <button
              onClick={() =>
                setProxyTarget({
                  level: "provider",
                  id: providerId,
                  label: providerInfo?.name || providerId,
                })
              }
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                proxyConfig?.providers?.[providerId]
                  ? "bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
                  : "bg-black/[0.03] text-text-muted/50 hover:bg-black/[0.06] hover:text-text-muted dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
              title={
                proxyConfig?.providers?.[providerId]
                  ? t("providerProxyTitleConfigured", {
                      host: proxyConfig.providers[providerId].host || t("configured"),
                    })
                  : t("providerProxyConfigureHint")
              }
            >
              <span className="material-symbols-outlined text-[14px]">vpn_lock</span>
              {proxyConfig?.providers?.[providerId]
                ? proxyConfig.providers[providerId].host || t("providerProxy")
                : t("providerProxy")}
            </button>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            {connections.length > 1 && (
              <button
                onClick={handleBatchTestAll}
                disabled={batchTesting || !!retestingId}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  batchTesting
                    ? "animate-pulse border-primary/40 bg-primary/20 text-primary"
                    : "border-border bg-bg-subtle text-text-muted hover:border-primary/40 hover:text-text-primary"
                }`}
                title={t("testAll")}
                aria-label={t("testAll")}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {batchTesting ? "sync" : "play_arrow"}
                </span>
                {batchTesting ? t("testing") : t("testAll")}
              </button>
            )}
            {!isCompatible ? (
              <>
                <Button
                  size="sm"
                  icon="add"
                  onClick={openPrimaryAddFlow}
                  className="h-8 rounded-lg px-3 text-xs"
                >
                  {providerSupportsPat ? "Add PAT" : t("add")}
                </Button>
              </>
            ) : (
              connections.length === 0 && (
                <Button
                  size="sm"
                  icon="add"
                  onClick={() => setShowAddApiKeyModal(true)}
                  className="h-8 rounded-lg px-3 text-xs"
                >
                  {t("add")}
                </Button>
              )
            )}
          </div>
        </div>

        {connections.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-r from-muted/40 to-transparent px-3 py-2.5 dark:from-zinc-900/40">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-text-main">
              <input
                ref={selectAllConnectionsRef}
                type="checkbox"
                checked={
                  sortedConnectionIds.length > 0 &&
                  sortedConnectionIds.every((id) => selectedConnectionIds.includes(id))
                }
                onChange={toggleSelectAllConnections}
                className="rounded border-border"
                aria-label={t("selectAllConnections")}
              />
              <span>{t("selectAllConnections")}</span>
            </label>
            <span className="text-xs text-text-muted">
              {t("selectedConnectionsCount", { count: selectedConnectionIds.length })}
            </span>
            <Button
              size="sm"
              variant="danger"
              icon="delete"
              disabled={selectedConnectionIds.length === 0 || bulkDeletingConnections}
              loading={bulkDeletingConnections}
              onClick={handleBulkDeleteConnections}
            >
              {t("deleteSelectedConnections")}
            </Button>
          </div>
        )}

        {connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-bg-subtle/30 py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <span className="material-symbols-outlined text-[32px]">
                {isOAuth ? "lock" : "key"}
              </span>
            </div>
            <p className="mb-1 font-medium text-text-main">{t("noConnectionsYet")}</p>
            <p className="mb-4 text-sm text-text-muted">{t("addFirstConnectionHint")}</p>
            {!isCompatible && (
              <div className="flex items-center justify-center gap-2">
                <Button icon="add" onClick={openPrimaryAddFlow}>
                  {providerSupportsPat ? "Add PAT" : t("addConnection")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          (() => {
            // Group connections by tag (providerSpecificData.tag)
            const sorted = [...connections].sort((a, b) => (a.priority || 0) - (b.priority || 0));
            const hasAnyTag = sorted.some((c) => c.providerSpecificData?.tag as string | undefined);

            if (!hasAnyTag) {
              // No tags — render flat list as before
              return (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-bg-subtle/25 to-transparent dark:from-white/[0.02]">
                  <div className="flex flex-col divide-y divide-border/50">
                    {sorted.map((conn, index) => (
                      <ProviderDetailConnectionRow
                        key={conn.id}
                        connection={conn}
                        isOAuth={conn.authType === "oauth"}
                        isFirst={index === 0}
                        isLast={index === sorted.length - 1}
                        onMoveUp={() => handleSwapPriority(conn, sorted[index - 1])}
                        onMoveDown={() => handleSwapPriority(conn, sorted[index + 1])}
                        onToggleActive={(isActive) =>
                          handleUpdateConnectionStatus(conn.id, isActive)
                        }
                        onToggleRateLimit={(enabled) => handleToggleRateLimit(conn.id, enabled)}
                        isCodex={providerId === "codex"}
                        onToggleCodex5h={(enabled) =>
                          handleToggleCodexLimit(conn.id, "use5h", enabled)
                        }
                        onToggleCodexWeekly={(enabled) =>
                          handleToggleCodexLimit(conn.id, "useWeekly", enabled)
                        }
                        onRetest={() => handleRetestConnection(conn.id)}
                        isRetesting={retestingId === conn.id}
                        onEdit={() => {
                          setSelectedConnection(conn);
                          setShowEditModal(true);
                        }}
                        onDelete={() => handleDelete(conn.id)}
                        showBulkSelect
                        bulkSelected={
                          typeof conn.id === "string" && selectedConnectionIds.includes(conn.id)
                        }
                        onToggleBulkSelect={
                          typeof conn.id === "string"
                            ? () => toggleConnectionBulkSelect(conn.id)
                            : undefined
                        }
                        onReauth={
                          conn.authType === "oauth" && allowQoderOAuthUi
                            ? () => setShowOAuthModal(true)
                            : undefined
                        }
                        onRefreshToken={
                          conn.authType === "oauth" ? () => handleRefreshToken(conn.id) : undefined
                        }
                        isRefreshing={refreshingId === conn.id}
                        onApplyCodexAuthLocal={
                          providerId === "codex"
                            ? () => handleApplyCodexAuthLocal(conn.id)
                            : undefined
                        }
                        isApplyingCodexAuthLocal={applyingCodexAuthId === conn.id}
                        onExportCodexAuthFile={
                          providerId === "codex"
                            ? () => handleExportCodexAuthFile(conn.id)
                            : undefined
                        }
                        isExportingCodexAuthFile={exportingCodexAuthId === conn.id}
                        onProxy={() =>
                          setProxyTarget({
                            level: "key",
                            id: conn.id,
                            label: conn.name || conn.email || conn.id,
                          })
                        }
                        hasProxy={!!connProxyMap[conn.id]?.proxy}
                        proxySource={connProxyMap[conn.id]?.level || null}
                        proxyHost={connProxyMap[conn.id]?.proxy?.host || null}
                      />
                    ))}
                  </div>
                </div>
              );
            }

            // Build ordered tag groups: untagged first, then alphabetically
            const groupMap = new Map<string, typeof sorted>();
            for (const conn of sorted) {
              const tag = (conn.providerSpecificData?.tag as string | undefined)?.trim() || "";
              if (!groupMap.has(tag)) groupMap.set(tag, []);
              groupMap.get(tag)!.push(conn);
            }
            const groupKeys = Array.from(groupMap.keys()).sort((a, b) => {
              if (a === "") return -1;
              if (b === "") return 1;
              return a.localeCompare(b);
            });

            return (
              <div className="flex flex-col gap-3">
                {groupKeys.map((tag, gi) => {
                  const groupConns = groupMap.get(tag)!;
                  return (
                    <div
                      key={tag || "__untagged__"}
                      className={gi > 0 ? "mt-1 border-t border-border/50 pt-3" : ""}
                    >
                      {tag && (
                        <div className="flex items-center gap-2 px-1 pb-2 pt-1 sm:px-2">
                          <span className="material-symbols-outlined text-[13px] text-text-muted/50">
                            label
                          </span>
                          <span className="select-none text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted/70">
                            {tag}
                          </span>
                          <div className="h-px flex-1 bg-border/60" />
                          <span className="text-[10px] tabular-nums text-text-muted/50">
                            {groupConns.length}
                          </span>
                        </div>
                      )}
                      <div className="overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-bg-subtle/25 to-transparent dark:from-white/[0.02]">
                        <div className="flex flex-col divide-y divide-border/50">
                          {groupConns.map((conn, index) => (
                            <ProviderDetailConnectionRow
                              key={conn.id}
                              connection={conn}
                              isOAuth={conn.authType === "oauth"}
                              isFirst={gi === 0 && index === 0}
                              isLast={
                                gi === groupKeys.length - 1 && index === groupConns.length - 1
                              }
                              onMoveUp={() =>
                                handleSwapPriority(conn, sorted[sorted.indexOf(conn) - 1])
                              }
                              onMoveDown={() =>
                                handleSwapPriority(conn, sorted[sorted.indexOf(conn) + 1])
                              }
                              onToggleActive={(isActive) =>
                                handleUpdateConnectionStatus(conn.id, isActive)
                              }
                              onToggleRateLimit={(enabled) =>
                                handleToggleRateLimit(conn.id, enabled)
                              }
                              isCodex={providerId === "codex"}
                              onToggleCodex5h={(enabled) =>
                                handleToggleCodexLimit(conn.id, "use5h", enabled)
                              }
                              onToggleCodexWeekly={(enabled) =>
                                handleToggleCodexLimit(conn.id, "useWeekly", enabled)
                              }
                              onRetest={() => handleRetestConnection(conn.id)}
                              isRetesting={retestingId === conn.id}
                              onEdit={() => {
                                setSelectedConnection(conn);
                                setShowEditModal(true);
                              }}
                              onDelete={() => handleDelete(conn.id)}
                              showBulkSelect
                              bulkSelected={
                                typeof conn.id === "string" &&
                                selectedConnectionIds.includes(conn.id)
                              }
                              onToggleBulkSelect={
                                typeof conn.id === "string"
                                  ? () => toggleConnectionBulkSelect(conn.id)
                                  : undefined
                              }
                              onReauth={
                                conn.authType === "oauth" && allowQoderOAuthUi
                                  ? () => setShowOAuthModal(true)
                                  : undefined
                              }
                              onRefreshToken={
                                conn.authType === "oauth"
                                  ? () => handleRefreshToken(conn.id)
                                  : undefined
                              }
                              isRefreshing={refreshingId === conn.id}
                              onApplyCodexAuthLocal={
                                providerId === "codex"
                                  ? () => handleApplyCodexAuthLocal(conn.id)
                                  : undefined
                              }
                              isApplyingCodexAuthLocal={applyingCodexAuthId === conn.id}
                              onExportCodexAuthFile={
                                providerId === "codex"
                                  ? () => handleExportCodexAuthFile(conn.id)
                                  : undefined
                              }
                              isExportingCodexAuthFile={exportingCodexAuthId === conn.id}
                              onProxy={() =>
                                setProxyTarget({
                                  level: "key",
                                  id: conn.id,
                                  label: conn.name || conn.email || conn.id,
                                })
                              }
                              hasProxy={!!connProxyMap[conn.id]?.proxy}
                              proxySource={connProxyMap[conn.id]?.level || null}
                              proxyHost={connProxyMap[conn.id]?.proxy?.host || null}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </Card>

      {/* Models — hidden for search providers (they don't have models) */}
      {!isSearchProvider && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-text-muted/70" aria-hidden>
              smart_toy
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{t("availableModels")}</h2>
          </div>
          {renderModelsSection()}

          {/* Custom Models — available for providers without managed available-model metadata */}
          {!isManagedAvailableModelsProvider && providerId !== "gemini" && (
            <CustomModelsSection
              providerId={providerId}
              providerAlias={providerDisplayAlias}
              copied={copied}
              onCopy={copy}
              onModelsChanged={fetchProviderModelMeta}
              onTestModel={handleTestModel}
              modelTestResults={modelTestResults}
              testingModelKey={testingModelKey}
              canTestModels={connections.length > 0}
            />
          )}
        </Card>
      )}

      {/* Search provider info */}
      {isSearchProvider && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-text-muted/70" aria-hidden>
              search
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{t("searchProvider")}</h2>
          </div>
          <p className="text-sm leading-relaxed text-text-muted">{t("searchProviderDesc")}</p>
          {providerId === "perplexity-search" && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3">
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-sm text-blue-400">
                link
              </span>
              <p className="text-xs leading-relaxed text-blue-200/90">
                Uses the same API key as <strong>Perplexity</strong> (chat provider). If you already
                have Perplexity configured, no additional setup is needed.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      {providerId === "kiro" ? (
        <KiroOAuthWrapper
          isOpen={showOAuthModal}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => {
            setShowOAuthModal(false);
          }}
        />
      ) : providerId === "cursor" ? (
        <CursorAuthModal
          isOpen={showOAuthModal}
          onSuccess={handleOAuthSuccess}
          onClose={() => {
            setShowOAuthModal(false);
          }}
        />
      ) : (
        <OAuthModal
          isOpen={showOAuthModal}
          provider={providerId}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => {
            setShowOAuthModal(false);
          }}
        />
      )}
      <ProviderDetailAddApiKeyModal
        isOpen={showAddApiKeyModal}
        provider={providerId}
        providerName={providerInfo.name}
        isCompatible={isCompatible}
        isAnthropic={isAnthropicProtocolCompatible}
        isCcCompatible={isCcCompatible}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddApiKeyModal(false)}
      />
      <ProviderDetailEditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />
      {isCompatible && (
        <ProviderDetailEditCompatibleNodeModal
          isOpen={showEditNodeModal}
          node={providerNode}
          onSave={handleUpdateNode}
          onClose={() => setShowEditNodeModal(false)}
          isAnthropic={isAnthropicProtocolCompatible}
          isCcCompatible={isCcCompatible}
        />
      )}
      <ProviderDetailBatchTestResultsModal
        batchTestResults={batchTestResults}
        providerName={providerInfo?.name || providerId}
        t={t}
        onClose={() => setBatchTestResults(null)}
      />
      {/* Proxy Config Modal */}
      {proxyTarget && (
        <ProxyConfigModal
          isOpen={!!proxyTarget}
          onClose={() => setProxyTarget(null)}
          level={proxyTarget.level}
          levelId={proxyTarget.id}
          levelLabel={proxyTarget.label}
          onSaved={() => void loadConnProxies(connections)}
        />
      )}
    </div>
  );
}
