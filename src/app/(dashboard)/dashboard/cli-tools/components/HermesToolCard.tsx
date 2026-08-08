"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import CliStatusBadge from "./CliStatusBadge";
import EndpointPresetControl from "./EndpointPresetControl";
import {
  HERMES_API_KEY_ENV,
  buildModelBlock,
  upsertTitleGenerationBlock,
} from "@/shared/services/hermesConfigYaml";
import { useTranslations } from "next-intl";

const ENDPOINT = "/api/cli-tools/hermes-settings";

export default function HermesToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl: _baseUrl,
  hasActiveProviders,
  apiKeys,
  activeProviders,
  cloudEnabled,
  batchStatus,
  lastConfiguredAt,
}) {
  const t = useTranslations("cliTools");
  const [hermesStatus, setHermesStatus] = useState(batchStatus || null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [titleModel, setTitleModel] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState<Record<string, string>>({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const hasInitializedModel = useRef(false);

  const getConfigStatus = () => {
    if (!hermesStatus?.installed) return null;
    // The batch endpoint reports runtime only. Until the settings GET lands there is nothing
    // to judge, so defer to the batch verdict rather than claiming "not configured".
    if (!hermesStatus.settings) return null;
    const cfg = hermesStatus.settings.model;
    if (!cfg?.base_url) return "not_configured";
    const localMatch = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(cfg.base_url);
    if (localMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();
  const effectiveConfigStatus = configStatus || batchStatus?.configStatus || null;

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys]);

  useEffect(() => {
    if (batchStatus) setHermesStatus((prev) => prev || batchStatus);
  }, [batchStatus]);

  useEffect(() => {
    // Seeded from the batch status, `hermesStatus` is truthy before any settings are known —
    // gate on the settings themselves or the card never reads ~/.hermes/config.yaml.
    if (isExpanded && !hermesStatus?.settings) checkStatus();
    if (isExpanded) fetchModelAliases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  useEffect(() => {
    if (hermesStatus?.settings && !hasInitializedModel.current) {
      hasInitializedModel.current = true;
      const cfg = hermesStatus.settings.model;
      if (cfg?.default) setSelectedModel(cfg.default);
      const title = hermesStatus.settings?.titleGeneration;
      if (title?.provider === "custom" && title.model) setTitleModel(title.model);
    }
  }, [hermesStatus]);

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(ENDPOINT);
      const data = await res.json();
      setHermesStatus(data);
    } catch (error) {
      setHermesStatus({ installed: false, error: (error as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const normalizeLocalhost = (url: string) => url.replace("://localhost", "://127.0.0.1");

  const getLocalBaseUrl = () => {
    if (typeof window !== "undefined") {
      return normalizeLocalhost(window.location.origin);
    }
    return "http://127.0.0.1:20128";
  };

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || getLocalBaseUrl();
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const hasCustomSelectedApiKey =
    selectedApiKey && !apiKeys.some((key) => key.id === selectedApiKey);

  const handleApply = async () => {
    setApplying(true);
    setMessage(null);
    try {
      const selectedKeyId = selectedApiKey?.trim() || (apiKeys?.length > 0 ? apiKeys[0].id : null);
      const fallbackKey = !cloudEnabled ? "sk_routiform" : null;

      const postBody: Record<string, unknown> = {
        baseUrl: getEffectiveBaseUrl(),
        model: selectedModel,
        titleModel: titleModel.trim(),
      };

      if (selectedKeyId) {
        postBody.keyId = selectedKeyId;
      } else if (fallbackKey) {
        postBody.apiKey = fallbackKey;
      }

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message || t("settingsApplied") });
        checkStatus();
      } else {
        setMessage({ type: "error", text: data.error || t("failedApplySettings") });
      }
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setApplying(false);
    }
  };

  const handleReset = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message || t("settingsReset") });
        setSelectedModel("");
        setTitleModel("");
        checkStatus();
      } else {
        setMessage({ type: "error", text: data.error || t("failedResetSettings") });
      }
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setRestoring(false);
    }
  };

  const handleModelSelect = (model: { value: string }) => {
    setSelectedModel(model.value);
    setModalOpen(false);
  };

  const getManualConfigs = () => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_routiform"
          : "<API_KEY_FROM_DASHBOARD>";

    const baseUrl = getEffectiveBaseUrl();
    const modelBlock = buildModelBlock(selectedModel || "provider/model-id", baseUrl);
    const yamlContent = titleModel.trim()
      ? upsertTitleGenerationBlock(modelBlock, { model: titleModel.trim(), baseUrl })
      : modelBlock;
    const envContent = `${HERMES_API_KEY_ENV}=${keyToUse}\n`;

    return [
      { filename: "~/.hermes/config.yaml", content: yamlContent },
      { filename: "~/.hermes/.env", content: envContent },
    ];
  };

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image
              src="/providers/hermes.png"
              alt={tool.name}
              width={32}
              height={32}
              className="size-8 object-contain rounded-lg"
              sizes="32px"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              <CliStatusBadge
                effectiveConfigStatus={effectiveConfigStatus}
                batchStatus={batchStatus}
                lastConfiguredAt={lastConfiguredAt}
              />
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <span
          className={`material-symbols-outlined text-text-muted text-[20px] transition-transform ${isExpanded ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checking && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>{t("checkingHermes")}</span>
            </div>
          )}

          {!checking && hermesStatus && !hermesStatus.installed && (
            <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-yellow-500">warning</span>
                <div className="flex-1">
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    {t("hermesNotInstalled")}
                  </p>
                  <p className="text-sm text-text-muted">{t("hermesInstallPrompt")}</p>
                </div>
              </div>
              <div className="pl-9">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowManualConfigModal(true)}
                  className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30"
                >
                  <span className="material-symbols-outlined text-[18px] mr-1">content_copy</span>
                  {t("manualConfig")}
                </Button>
              </div>
            </div>
          )}

          {!checking && hermesStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {hermesStatus?.settings?.model?.base_url && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                      {t("current")}
                    </span>
                    <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                      arrow_forward
                    </span>
                    <span className="min-w-0 truncate rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5">
                      {hermesStatus.settings.model.base_url}
                    </span>
                  </div>
                )}

                <EndpointPresetControl
                  baseUrl={getEffectiveBaseUrl()}
                  apiKey={selectedApiKey}
                  onBaseUrlChange={setCustomBaseUrl}
                  onApiKeyChange={setSelectedApiKey}
                />

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                    {t("baseUrl")}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                    arrow_forward
                  </span>
                  <input
                    type="text"
                    value={getEffectiveBaseUrl()}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://.../v1"
                    className="flex-1 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                  />
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                    {t("apiKey")}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                    arrow_forward
                  </span>
                  {apiKeys.length > 0 || selectedApiKey ? (
                    <select
                      value={selectedApiKey}
                      onChange={(e) => setSelectedApiKey(e.target.value)}
                      className="flex-1 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                    >
                      {hasCustomSelectedApiKey && (
                        <option value={selectedApiKey}>{selectedApiKey}</option>
                      )}
                      {apiKeys.map((key) => (
                        <option key={key.id} value={key.id}>
                          {key.key}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-2 sm:py-1.5">
                      {cloudEnabled ? t("noApiKeysCreateOne") : t("defaultRoutiformKey")}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                    {t("hermesDefaultModel")}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                    arrow_forward
                  </span>
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      placeholder="provider/model-id"
                      className="w-full min-w-0 pl-2 pr-7 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                    />
                    {selectedModel && (
                      <button
                        onClick={() => setSelectedModel("")}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-red-500 rounded transition-colors"
                        title={t("clear")}
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setModalOpen(true)}
                    disabled={!hasActiveProviders}
                    className={`w-full sm:w-auto rounded border px-2 py-2 text-xs transition-colors sm:py-1.5 whitespace-nowrap sm:shrink-0 ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    {t("selectModel")}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                    {t("hermesTitleModel")}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                    arrow_forward
                  </span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={titleModel}
                      onChange={(e) => setTitleModel(e.target.value)}
                      placeholder="provider/model-id"
                      className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                    />
                    <p className="mt-1 text-[11px] text-text-muted">{t("hermesTitleModelHint")}</p>
                  </div>
                </div>
              </div>

              {message && (
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {message.type === "success" ? "check_circle" : "error"}
                  </span>
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApply}
                  disabled={!selectedModel}
                  loading={applying}
                  className="w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">save</span>
                  {t("apply")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={!hermesStatus?.hasRoutiform}
                  loading={restoring}
                  className="w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">restore</span>
                  {t("reset")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowManualConfigModal(true)}
                  className="w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">content_copy</span>
                  {t("manualConfig")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={selectedModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("selectModelForTool", { tool: tool.name })}
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title={t("hermesManualConfiguration")}
        configs={getManualConfigs()}
      />
    </Card>
  );
}
