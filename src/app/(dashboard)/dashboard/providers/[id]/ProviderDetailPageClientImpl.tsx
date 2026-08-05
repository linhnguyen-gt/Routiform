"use client";

import { useProviderDetailOrchestrator } from "./hooks/useProviderDetailOrchestrator";
import { CardSkeleton } from "@/shared/components";
import { ProviderDetailHeroSection } from "./components/ProviderDetailHeroSection";
import { ProviderDetailCompatibleInfoSection } from "./components/ProviderDetailCompatibleInfoSection";
import { ProviderDetailConnectionsSection } from "./components/ProviderDetailConnectionsSection";
import { ProviderDetailModelsSection } from "./components/ProviderDetailModelsSection";
import { ProviderDetailSearchSection } from "./components/ProviderDetailSearchSection";
import { ProviderDetailModalsSection } from "./components/ProviderDetailModalsSection";
import Link from "next/link";

export function ProviderDetailPageClientImpl() {
  const orchestrator = useProviderDetailOrchestrator();

  if (orchestrator.loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!orchestrator.providerInfo) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center py-20">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-surface p-10 text-center shadow-sm">
          <span
            className="material-symbols-outlined mb-3 block text-4xl text-text-muted/80"
            aria-hidden
          >
            travel_explore
          </span>
          <p className="text-text-muted">{orchestrator.t("providerNotFound")}</p>
          <Link
            href="/dashboard/providers"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {orchestrator.t("backToProviders")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      <ProviderDetailHeroSection
        t={orchestrator.t}
        providerInfo={
          orchestrator.providerInfo as {
            color?: string;
            textIcon?: string;
            id: string;
            apiType?: string;
            name: string;
            website?: string;
          }
        }
        providerId={orchestrator.providerId}
        connections={orchestrator.connections}
        isOpenAICompatible={orchestrator.isOpenAICompatible}
        isAnthropicProtocolCompatible={orchestrator.isAnthropicProtocolCompatible}
        headerImgError={orchestrator.headerImgError}
        setHeaderImgError={orchestrator.setHeaderImgError}
      />

      <ProviderDetailCompatibleInfoSection
        t={orchestrator.t}
        isCcCompatible={orchestrator.isCcCompatible}
        isAnthropicCompatible={orchestrator.isAnthropicCompatible}
        isCompatible={orchestrator.isCompatible}
        providerNode={orchestrator.providerNode}
        providerId={orchestrator.providerId}
        isAnthropicProtocolCompatible={orchestrator.isAnthropicProtocolCompatible}
        connections={orchestrator.connections}
        setShowAddApiKeyModal={orchestrator.setShowAddApiKeyModal}
        setShowEditNodeModal={orchestrator.setShowEditNodeModal}
        router={orchestrator.router}
      />

      <ProviderDetailConnectionsSection
        t={orchestrator.t}
        connections={orchestrator.connections}
        providerId={orchestrator.providerId}
        providerInfo={orchestrator.providerInfo}
        isOAuth={orchestrator.isOAuth}
        isCompatible={orchestrator.isCompatible}
        providerSupportsPat={orchestrator.providerSupportsPat}
        openPrimaryAddFlow={() =>
          orchestrator.isOAuth
            ? orchestrator.setShowOAuthModal(true)
            : orchestrator.setShowAddApiKeyModal(true)
        }
        setShowAddApiKeyModal={orchestrator.setShowAddApiKeyModal}
        setShowBulkImportModal={orchestrator.setShowBulkImportModal}
        handleBatchTestAll={orchestrator.handleBatchTestAll}
        batchTesting={orchestrator.batchTesting}
        retestingId={orchestrator.retestingId}
        proxyConfig={orchestrator.proxyConfig}
        setProxyTarget={orchestrator.setProxyTarget}
        sortedConnectionIds={orchestrator.sortedConnectionIds}
        selectedConnectionIds={orchestrator.selectedConnectionIds}
        toggleSelectAllConnections={orchestrator.toggleSelectAllConnections}
        toggleConnectionBulkSelect={orchestrator.toggleConnectionBulkSelect}
        selectAllConnectionsRef={orchestrator.selectAllConnectionsRef}
        handleBulkDeleteConnections={orchestrator.handleBulkDeleteConnections}
        bulkDeletingConnections={orchestrator.bulkDeletingConnections}
        allSelectedActive={
          orchestrator.selectedConnectionIds.length > 0 &&
          orchestrator.selectedConnectionIds.every((id) => {
            const conn = orchestrator.connections.find((c) => c.id === id);
            return conn && conn.isActive;
          })
        }
        bulkUpdatingStatus={orchestrator.bulkUpdatingStatus}
        handleBulkUpdateConnectionStatus={orchestrator.handleBulkUpdateConnectionStatus}
        handleSwapPriority={orchestrator.handleSwapPriority}
        handleUpdateConnectionStatus={orchestrator.handleUpdateConnectionStatus}
        handleToggleRateLimit={async (id, enabled) => {
          try {
            const res = await fetch("/api/rate-limits", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ connectionId: id, enabled }),
            });
            if (res.ok) {
              orchestrator.fetchConnections();
            }
          } catch (error) {
            console.error("Error toggling rate limit:", error);
          }
        }}
        handleToggleCodexLimit={orchestrator.handleToggleCodexLimit}
        isCcCompatible={orchestrator.isCcCompatible}
        cpaProviderEnabled={orchestrator.cpaProviderEnabled}
        onToggleCliproxyapiMode={orchestrator.handleToggleCliproxyapiMode}
        handleRetestConnection={orchestrator.handleRetestConnection}
        setSelectedConnection={orchestrator.setSelectedConnection}
        setShowEditModal={orchestrator.setShowEditModal}
        handleDelete={orchestrator.handleDelete}
        allowQoderOAuthUi={orchestrator.allowQoderOAuthUi}
        setShowOAuthModal={orchestrator.setShowOAuthModal}
        handleRefreshToken={orchestrator.handleRefreshToken}
        refreshingId={orchestrator.refreshingId}
        handleApplyCodexAuthLocal={orchestrator.handleApplyCodexAuthLocal}
        applyingCodexAuthId={orchestrator.applyingCodexAuthId}
        handleExportCodexAuthFile={orchestrator.handleExportCodexAuthFile}
        exportingCodexAuthId={orchestrator.exportingCodexAuthId}
        connProxyMap={orchestrator.connProxyMap}
      />

      <ProviderDetailModelsSection
        t={orchestrator.t}
        providerId={orchestrator.providerId}
        isSearchProvider={orchestrator.isSearchProvider}
        isLiveCatalogProvider={orchestrator.isLiveCatalogProvider}
        opencodeLiveCatalog={orchestrator.opencodeLiveCatalog}
        canImportModels={orchestrator.connections.some((c) => c.isActive !== false)}
        handleToggleAutoSync={orchestrator.handleToggleAutoSync}
        togglingAutoSync={orchestrator.togglingAutoSync}
        supportsAutoSync={orchestrator.supportsAutoSync}
        isAutoSyncEnabled={orchestrator.isAutoSyncEnabled}
        handleRefreshModels={orchestrator.handleRefreshModels}
        refreshingModels={orchestrator.refreshingModels}
        handleClearAllModels={orchestrator.handleClearAllModels}
        clearingModels={orchestrator.clearingModels}
        modelMeta={orchestrator.modelMeta}
        providerAliasEntries={orchestrator.providerAliasEntries}
        isManagedAvailableModelsProvider={orchestrator.isManagedAvailableModelsProvider}
        isAnthropicCompatible={orchestrator.isAnthropicCompatible}
        isCcCompatible={orchestrator.isCcCompatible}
        providerStorageAlias={orchestrator.providerStorageAlias}
        providerDisplayAlias={orchestrator.providerDisplayAlias}
        modelAliases={orchestrator.modelAliases}
        compatibleFallbackModels={orchestrator.compatibleFallbackModels}
        copied={orchestrator.copied}
        copy={orchestrator.copy}
        handleSetAlias={orchestrator.handleSetAlias}
        handleDeleteAlias={orchestrator.handleDeleteAlias}
        connections={orchestrator.connections}
        isAnthropicProtocolCompatible={orchestrator.isAnthropicProtocolCompatible}
        effectiveModelNormalize={orchestrator.effectiveModelNormalize}
        effectiveModelPreserveDeveloper={orchestrator.effectiveModelPreserveDeveloper}
        getUpstreamHeadersRecordForModel={orchestrator.getUpstreamHeadersRecordForModel}
        saveModelCompatFlags={orchestrator.saveModelCompatFlags}
        compatSavingModelId={orchestrator.compatSavingModelId}
        fetchProviderModelMeta={orchestrator.fetchProviderModelMeta}
        modelTestResults={orchestrator.modelTestResults}
        testingModelKey={orchestrator.testingModelKey}
        handleTestModel={orchestrator.handleTestModel}
        handleTestAllModels={orchestrator.handleTestAllModels}
        testingAllModels={orchestrator.testingAllModels}
        providerInfo={orchestrator.providerInfo}
        models={orchestrator.models}
        autoSyncConnection={orchestrator.autoSyncConnection}
        fetchAliases={orchestrator.fetchAliases}
        modelTestBannerError={orchestrator.modelTestBannerError}
      />

      <ProviderDetailSearchSection
        t={orchestrator.t}
        isSearchProvider={orchestrator.isSearchProvider}
        providerId={orchestrator.providerId}
      />

      <ProviderDetailModalsSection
        providerId={orchestrator.providerId}
        providerInfo={orchestrator.providerInfo}
        showOAuthModal={orchestrator.showOAuthModal}
        setShowOAuthModal={orchestrator.setShowOAuthModal}
        handleOAuthSuccess={() => {
          orchestrator.fetchConnections();
          orchestrator.setShowOAuthModal(false);
        }}
        showAddApiKeyModal={orchestrator.showAddApiKeyModal}
        setShowAddApiKeyModal={orchestrator.setShowAddApiKeyModal}
        showBulkImportModal={orchestrator.showBulkImportModal}
        setShowBulkImportModal={orchestrator.setShowBulkImportModal}
        fetchConnections={orchestrator.fetchConnections}
        isCompatible={orchestrator.isCompatible}
        isAnthropicProtocolCompatible={orchestrator.isAnthropicProtocolCompatible}
        isCcCompatible={orchestrator.isCcCompatible}
        handleSaveApiKey={orchestrator.handleSaveApiKey}
        showEditModal={orchestrator.showEditModal}
        setShowEditModal={orchestrator.setShowEditModal}
        selectedConnection={orchestrator.selectedConnection}
        handleUpdateConnection={orchestrator.handleUpdateConnection}
        showEditNodeModal={orchestrator.showEditNodeModal}
        setShowEditNodeModal={orchestrator.setShowEditNodeModal}
        providerNode={orchestrator.providerNode as Record<string, unknown> | null}
        handleUpdateNode={orchestrator.handleUpdateNode}
        batchTestResults={orchestrator.batchTestResults as Record<string, unknown> | null}
        setBatchTestResults={orchestrator.setBatchTestResults}
        t={orchestrator.t}
        proxyTarget={
          orchestrator.proxyTarget as { level: string; id: string; label: string } | null
        }
        setProxyTarget={orchestrator.setProxyTarget}
        loadConnProxies={orchestrator.loadConnProxies}
        connections={orchestrator.connections}
      />
    </div>
  );
}
