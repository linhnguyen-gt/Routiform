import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import {
  getProviderAlias,
  isAnthropicCompatibleProvider,
  isClaudeCodeCompatibleProvider,
  isOpenAICompatibleProvider,
  supportsApiKeyOnFreeProvider,
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
} from "@/shared/constants/providers";
import { supportsProviderModelAutoSync } from "@/shared/utils/providerAutoSync";
import { useProviderDetailConnections } from "./useProviderDetailConnections";
import { useProviderDetailModels } from "./useProviderDetailModels";
import { useProviderDetailAliases } from "./useProviderDetailAliases";
import { useProviderDetailModals } from "./useProviderDetailModals";
import { useProviderDetailSelection } from "./useProviderDetailSelection";
import { CC_COMPATIBLE_LABEL } from "../../providerDetailCompatUtils";

export function useProviderDetailOrchestrator() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  const t = useTranslations("providers");
  const notify = useNotificationStore();
  const { copied, copy } = useCopyToClipboard();

  // Provider type detection
  const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
  const isCcCompatible = isClaudeCodeCompatibleProvider(providerId);
  const isAnthropicCompatible =
    isAnthropicCompatibleProvider(providerId) && !isClaudeCodeCompatibleProvider(providerId);
  const isCompatible = isOpenAICompatible || isAnthropicCompatible || isCcCompatible;
  const isAnthropicProtocolCompatible = isAnthropicCompatible || isCcCompatible;
  const isSearchProvider = providerId.endsWith("-search");
  const isLiveCatalogProvider =
    providerId === "opencode-zen" || providerId === "kilocode" || providerId === "codex";

  // Connections hook
  const { connections, loading, providerNode, fetchConnections, handleUpdateNode } =
    useProviderDetailConnections({ providerId, isCompatible });

  // Sorted connection IDs
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

  // Selection hook
  const selectAllConnectionsRef = useRef<HTMLInputElement>(null);
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

  // Models hook
  const {
    modelMeta,
    syncedAvailableModels,
    opencodeLiveCatalog,
    models,
    registryModels,
    syncedModels,
    fetchProviderModelMeta,
  } = useProviderDetailModels({
    providerId,
    isSearchProvider,
    isLiveCatalogProvider,
    loading,
    sortedConnectionIds,
  });

  // Aliases hook
  const providerAlias = getProviderAlias(providerId);
  const { modelAliases, fetchAliases, handleSetAlias, handleDeleteAlias } =
    useProviderDetailAliases(providerAlias, t);

  // Modals hook
  const {
    showOAuthModal,
    setShowOAuthModal,
    showAddApiKeyModal,
    setShowAddApiKeyModal,
    showEditModal,
    setShowEditModal,
    showEditNodeModal,
    setShowEditNodeModal,
    selectedConnection,
    setSelectedConnection,
    batchTestResults,
    setBatchTestResults,
  } = useProviderDetailModals();

  // Additional state
  const [qoderBrowserOAuthEnabled] = useState<boolean>(false);
  const [retestingId, setRetestingId] = useState<string | null>(null);
  const [batchTesting, setBatchTesting] = useState(false);
  const [headerImgErrorProviderId, setHeaderImgErrorProviderId] = useState<string | null>(null);
  const [proxyTarget, setProxyTarget] = useState<any>(null);
  const [proxyConfig, setProxyConfig] = useState<any>(null);
  const [connProxyMap, setConnProxyMap] = useState<
    Record<string, { proxy: any; level: string } | null>
  >({});
  const [modelTestResults, setModelTestResults] = useState<Record<string, "ok" | "error">>({});
  const [testingModelKey, setTestingModelKey] = useState<string | null>(null);
  const [modelTestBannerError, setModelTestBannerError] = useState("");
  const modelTestInFlightRef = useRef(false);
  const [bulkDeletingConnections, setBulkDeletingConnections] = useState(false);
  const [compatSavingModelId, setCompatSavingModelId] = useState<string | null>(null);
  const [applyingCodexAuthId, setApplyingCodexAuthId] = useState<string | null>(null);
  const [exportingCodexAuthId, setExportingCodexAuthId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [togglingAutoSync, setTogglingAutoSync] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [clearingModels, setClearingModels] = useState(false);
  const autoSyncBootstrappedRef = useRef<Set<string>>(new Set());

  // Provider info
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
  const isManagedAvailableModelsProvider = isCompatible || providerId === "openrouter";
  const supportsAutoSync = supportsProviderModelAutoSync(providerId);
  const providerStorageAlias = isCompatible ? providerId : providerAlias;
  const providerDisplayAlias = isCompatible ? providerNode?.prefix || providerId : providerAlias;

  const headerImgError = headerImgErrorProviderId === providerId;
  const setHeaderImgError = useCallback(
    (hasError: boolean) => {
      setHeaderImgErrorProviderId(hasError ? providerId : null);
    },
    [providerId]
  );

  // Load proxy config
  useEffect(() => {
    fetch("/api/settings/proxy")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setProxyConfig(c))
      .catch(() => {});
  }, []);

  // Load per-connection proxies
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
    if (!loading && connections.length > 0) {
      const timeoutId = setTimeout(() => {
        void loadConnProxies(connections);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [loading, connections, loadConnProxies]);

  return {
    // Core
    providerId,
    router,
    t,
    notify,
    copied,
    copy,

    // Provider info
    providerInfo,
    providerNode,
    providerAlias,
    providerDisplayAlias,
    providerStorageAlias,
    isOpenAICompatible,
    isCcCompatible,
    isAnthropicCompatible,
    isCompatible,
    isAnthropicProtocolCompatible,
    isSearchProvider,
    isLiveCatalogProvider,
    isManagedAvailableModelsProvider,
    providerSupportsOAuth,
    providerSupportsPat,
    isOAuth,
    allowQoderOAuthUi,
    supportsAutoSync,

    // Connections
    connections,
    loading,
    sortedConnectionIds,
    fetchConnections,
    handleUpdateNode,

    // Selection
    selectedConnectionIds,
    setSelectedConnectionIds,
    toggleConnectionBulkSelect,
    toggleSelectAllConnections,
    selectAllConnectionsRef,

    // Models
    modelMeta,
    syncedAvailableModels,
    opencodeLiveCatalog,
    models,
    registryModels,
    syncedModels,
    fetchProviderModelMeta,

    // Aliases
    modelAliases,
    fetchAliases,
    handleSetAlias,
    handleDeleteAlias,

    // Modals
    showOAuthModal,
    setShowOAuthModal,
    showAddApiKeyModal,
    setShowAddApiKeyModal,
    showEditModal,
    setShowEditModal,
    showEditNodeModal,
    setShowEditNodeModal,
    selectedConnection,
    setSelectedConnection,
    batchTestResults,
    setBatchTestResults,

    // Additional state
    qoderBrowserOAuthEnabled,
    retestingId,
    setRetestingId,
    batchTesting,
    setBatchTesting,
    headerImgError,
    setHeaderImgError,
    proxyTarget,
    setProxyTarget,
    proxyConfig,
    connProxyMap,
    loadConnProxies,
    modelTestResults,
    setModelTestResults,
    testingModelKey,
    setTestingModelKey,
    modelTestBannerError,
    setModelTestBannerError,
    modelTestInFlightRef,
    bulkDeletingConnections,
    setBulkDeletingConnections,
    compatSavingModelId,
    setCompatSavingModelId,
    applyingCodexAuthId,
    setApplyingCodexAuthId,
    exportingCodexAuthId,
    setExportingCodexAuthId,
    refreshingId,
    setRefreshingId,
    togglingAutoSync,
    setTogglingAutoSync,
    refreshingModels,
    setRefreshingModels,
    clearingModels,
    setClearingModels,
    autoSyncBootstrappedRef,
  };
}
