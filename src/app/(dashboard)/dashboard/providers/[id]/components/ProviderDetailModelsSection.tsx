"use client";

import { Card } from "@/shared/components";
import { CompatibleModelsSection } from "../../components/ProviderDetailCompatibleModelsSection";
import { PassthroughModelsSection } from "../../components/ProviderDetailPassthroughModelsSection";
import { ModelRow } from "../../components/ProviderDetailModelRow";
import { CustomModelsSection } from "../../components/ProviderDetailCustomModelsSection";

interface ProviderDetailModelsSectionProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  providerId: string;
  isSearchProvider: boolean;
  isLiveCatalogProvider: boolean;
  opencodeLiveCatalog: { status: string; errorMessage?: string };
  canImportModels: boolean;
  handleToggleAutoSync: (conn: unknown, enabled: boolean) => void;
  togglingAutoSync: boolean;
  supportsAutoSync: boolean;
  isAutoSyncEnabled: boolean;
  handleRefreshModels: (conn: unknown) => void;
  refreshingModels: boolean;
  handleClearAllModels: (
    storageAlias: string,
    entries: unknown[],
    fetchAliases: () => void | Promise<void>
  ) => void;
  clearingModels: boolean;
  modelMeta: { customModels: unknown[] };
  providerAliasEntries: unknown[];
  isManagedAvailableModelsProvider: boolean;
  isAnthropicCompatible: boolean;
  isCcCompatible: boolean;
  providerStorageAlias: string;
  providerDisplayAlias: string;
  modelAliases: Record<string, string>;
  compatibleFallbackModels: import("../types").CompatModelRow[];
  copied: string | undefined;
  copy: (text: string, key: string) => void;
  handleSetAlias: (modelId: string, alias: string, providerAliasOverride?: string) => Promise<void>;
  handleDeleteAlias: (alias: string) => Promise<void>;
  connections: { id?: string; isActive?: boolean }[];
  isAnthropicProtocolCompatible: boolean;
  effectiveModelNormalize: (modelId: string, protocol?: string) => boolean;
  effectiveModelPreserveDeveloper: (modelId: string, protocol?: string) => boolean;
  getUpstreamHeadersRecordForModel: (modelId: string, protocol: string) => Record<string, string>;
  saveModelCompatFlags: (modelId: string, flags: unknown) => Promise<void>;
  compatSavingModelId: string | null;
  fetchProviderModelMeta: () => void | Promise<void>;
  modelTestResults: Record<string, "ok" | "error">;
  testingModelKey: string | null;
  handleTestModel: (key: string) => Promise<boolean>;
  providerInfo: { passthroughModels?: boolean };
  models: { id: string }[];
  autoSyncConnection: unknown;
  fetchAliases: () => void | Promise<void>;
  modelTestBannerError: string;
}

export function ProviderDetailModelsSection({
  t,
  providerId,
  isSearchProvider,
  isLiveCatalogProvider,
  opencodeLiveCatalog,
  canImportModels,
  handleToggleAutoSync,
  togglingAutoSync,
  supportsAutoSync,
  isAutoSyncEnabled,
  handleRefreshModels,
  refreshingModels,
  handleClearAllModels,
  clearingModels,
  modelMeta,
  providerAliasEntries,
  isManagedAvailableModelsProvider,
  isAnthropicCompatible,
  isCcCompatible,
  providerStorageAlias,
  providerDisplayAlias,
  modelAliases,
  compatibleFallbackModels,
  copied,
  copy,
  handleSetAlias,
  handleDeleteAlias,
  connections,
  isAnthropicProtocolCompatible,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecordForModel,
  saveModelCompatFlags,
  compatSavingModelId,
  fetchProviderModelMeta,
  modelTestResults,
  testingModelKey,
  handleTestModel,
  providerInfo,
  models,
  autoSyncConnection,
  fetchAliases,
  modelTestBannerError,
}: ProviderDetailModelsSectionProps) {
  if (isSearchProvider) return null;
  const usesFetchedCatalogProvider = isLiveCatalogProvider || providerId === "antigravity";

  const modelTestBanner = modelTestBannerError ? (
    <p className="mb-3 break-words text-xs text-red-500">{modelTestBannerError}</p>
  ) : null;

  const renderModelsContent = () => {
    if (usesFetchedCatalogProvider) {
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

    const autoSyncToggle = canImportModels && !isLiveCatalogProvider && (
      <button
        onClick={() => handleToggleAutoSync(autoSyncConnection, isAutoSyncEnabled)}
        disabled={togglingAutoSync || !supportsAutoSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-transparent cursor-pointer text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
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
        onClick={() => handleRefreshModels(autoSyncConnection)}
        disabled={refreshingModels || !supportsAutoSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-transparent cursor-pointer text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span
          className={`material-symbols-outlined text-[16px] ${refreshingModels ? "animate-spin" : ""}`}
        >
          refresh
        </span>
        <span className="text-text-main">Refresh</span>
      </button>
    );

    const isOpenRouterProvider =
      providerId === "openrouter" || providerStorageAlias === "openrouter";
    const isKiloGatewayProvider = providerId === "kilo-gateway";
    const clearAllButton = !isOpenRouterProvider &&
      !isKiloGatewayProvider &&
      modelMeta.customModels.length > 0 && (
        <button
          onClick={() =>
            handleClearAllModels(providerStorageAlias, providerAliasEntries, fetchAliases)
          }
          disabled={clearingModels}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 bg-transparent cursor-pointer text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
          <span>{t("clearAllModels")}</span>
        </button>
      );

    if (isManagedAvailableModelsProvider) {
      const description = isCcCompatible
        ? "CC Compatible available models mirror the OAuth Claude Code provider list."
        : t("compatibleModelsDescription", {
            type: isAnthropicCompatible ? t("anthropic") : t("openai"),
          });
      const inputLabel = t("modelId");
      const inputPlaceholder = isCcCompatible
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
            {refreshModelsButton}
            {clearAllButton}
            {!canImportModels && (
              <span className="text-xs text-text-muted">{t("addConnectionToImport")}</span>
            )}
          </div>
          <PassthroughModelsSection
            providerAlias={providerId}
            models={models}
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

  return (
    <Card className="rounded-xl border-border/50 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <span className="material-symbols-outlined text-text-muted/70" aria-hidden>
          smart_toy
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{t("availableModels")}</h2>
      </div>
      {renderModelsContent()}

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
  );
}
