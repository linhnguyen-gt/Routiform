"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import CliStatusBadge from "./CliStatusBadge";
import { useTranslations } from "next-intl";

const ENDPOINT = "/api/cli-tools/cowork-settings";
const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

const isLocalhostUrl = (url: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url || "");

const stripV1 = (url: string) => (url || "").replace(/\/v1\/?$/, "");
const ensureV1 = (url: string) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export default function CoworkToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl: _baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  cloudEnabled,
  batchStatus,
  lastConfiguredAt,
}) {
  const t = useTranslations("cliTools");
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState<Record<string, string>>({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [endpointMode, setEndpointMode] = useState("custom");
  const [customBaseUrl, setCustomBaseUrl] = useState("");

  const endpointOptions = useMemo(() => {
    const opts: { value: string; label: string; url: string }[] = [];
    if (cloudEnabled && CLOUD_URL) {
      opts.push({
        value: "cloud",
        label: `Cloud - ${CLOUD_URL}`,
        url: ensureV1(CLOUD_URL),
      });
    }
    opts.push({ value: "custom", label: "Custom URL (VPS / public host)", url: "" });
    return opts;
  }, [cloudEnabled]);

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].id);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (batchStatus) setStatus((prev) => prev || batchStatus);
  }, [batchStatus]);

  useEffect(() => {
    if (isExpanded && !status) {
      checkStatus();
      fetchModelAliases();
    }
    if (isExpanded) fetchModelAliases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  useEffect(() => {
    if (status?.cowork?.models?.length) {
      setSelectedModels(status.cowork.models);
    }
    if (status?.cowork?.baseUrl && !customBaseUrl) {
      setCustomBaseUrl(stripV1(status.cowork.baseUrl));
      setEndpointMode("custom");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!customBaseUrl && endpointOptions[0]?.url) {
      setEndpointMode(endpointOptions[0].value);
      setCustomBaseUrl(stripV1(endpointOptions[0].url));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointOptions]);

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
      setStatus(data);
    } catch (error) {
      setStatus({ installed: false, error: (error as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const getEffectiveBaseUrl = () => ensureV1(customBaseUrl);

  const getConfigStatus = () => {
    if (!status?.installed) return null;
    const url = status?.cowork?.baseUrl;
    if (!url) return "not_configured";
    if (isLocalhostUrl(url)) return "invalid";
    return status.hasRoutiform ? "configured" : "other";
  };

  const configStatus = getConfigStatus();
  const effectiveConfigStatus = configStatus || batchStatus?.configStatus || null;
  const hasCustomSelectedApiKey =
    selectedApiKey && !apiKeys.some((key) => key.id === selectedApiKey);

  const handleEndpointModeChange = (value: string) => {
    setEndpointMode(value);
    const opt = endpointOptions.find((o) => o.value === value);
    if (opt?.url) {
      setCustomBaseUrl(stripV1(opt.url));
    } else {
      setCustomBaseUrl("");
    }
  };

  const handleApply = async () => {
    setMessage(null);
    const effectiveUrl = getEffectiveBaseUrl();

    if (isLocalhostUrl(effectiveUrl)) {
      setMessage({
        type: "error",
        text: t("coworkLocalhostError"),
      });
      return;
    }
    if (selectedModels.length === 0) {
      setMessage({ type: "error", text: t("selectAtLeastOneModel") });
      return;
    }

    setApplying(true);
    try {
      const selectedKeyId = selectedApiKey?.trim() || (apiKeys?.length > 0 ? apiKeys[0].id : null);
      const fallbackKey = !cloudEnabled ? "sk_routiform" : null;

      const postBody: Record<string, unknown> = {
        baseUrl: effectiveUrl,
        models: selectedModels,
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
        setMessage({
          type: "success",
          text: data.message || t("settingsAppliedCowork"),
        });
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
        setMessage({ type: "success", text: t("settingsReset") });
        setSelectedModels([]);
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

  const getManualConfigs = () => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_routiform"
          : "<API_KEY_FROM_DASHBOARD>";

    const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
    const cfg = {
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: getEffectiveBaseUrl() || "https://your-public-host/v1",
      inferenceGatewayApiKey: keyToUse,
      inferenceModels: modelsToShow.map((name) => ({ name })),
    };

    return [
      {
        filename: "~/Library/Application Support/Claude-3p/configLibrary/<appliedId>.json",
        content: JSON.stringify(cfg, null, 2),
      },
    ];
  };

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image
              src="/providers/claude.png"
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
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
            <span>{t("coworkVpcNotice")}</span>
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>{t("checkingCowork")}</span>
            </div>
          )}

          {!checking && status && !status.installed && (
            <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-yellow-500">warning</span>
                <div className="flex-1">
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    {t("coworkNotDetected")}
                  </p>
                  <p className="text-sm text-text-muted">{t("coworkSetupInstructions")}</p>
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

          {!checking && status?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {status?.cowork?.baseUrl && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                      {t("current")}
                    </span>
                    <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                      arrow_forward
                    </span>
                    <span className="min-w-0 truncate rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5">
                      {status.cowork.baseUrl}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">
                    {t("endpointMode")}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">
                    arrow_forward
                  </span>
                  <select
                    value={endpointMode}
                    onChange={(e) => handleEndpointModeChange(e.target.value)}
                    className="w-full min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                  >
                    {endpointOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

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
                    onChange={(e) => setCustomBaseUrl(stripV1(e.target.value))}
                    placeholder="https://your-host.com/v1"
                    className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
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
                      className="w-full min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
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
                    <span className="min-w-0 rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5">
                      {cloudEnabled ? t("noApiKeysCreateOne") : t("defaultRoutiformKey")}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-start sm:gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right pt-1">
                    {t("models")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px] mt-1.5">
                    arrow_forward
                  </span>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5 min-h-[28px] px-2 py-1.5 bg-surface rounded border border-border">
                      {selectedModels.length === 0 ? (
                        <span className="text-xs text-text-muted">{t("noModelsSelected")}</span>
                      ) : (
                        selectedModels.map((m) => (
                          <span
                            key={m}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/5 text-text-muted border border-transparent hover:border-border"
                          >
                            {m}
                            <button
                              onClick={() =>
                                setSelectedModels((prev) => prev.filter((x) => x !== m))
                              }
                              className="ml-0.5 hover:text-red-500"
                            >
                              <span className="material-symbols-outlined text-[12px]">close</span>
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => setModalOpen(true)}
                      disabled={!hasActiveProviders}
                      className={`self-start px-2 py-1 rounded border text-xs transition-colors ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                    >
                      {t("addModel")}
                    </button>
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
                  disabled={selectedModels.length === 0}
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
                  disabled={!status.hasRoutiform}
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
        // Multi-select, like the other cards that keep a model list: picking toggles the
        // entry and the modal stays open until dismissed.
        onSelect={(model: { value: string }) => {
          setSelectedModels((current) =>
            current.includes(model.value)
              ? current.filter((item) => item !== model.value)
              : [...current, model.value]
          );
        }}
        selectedModel={selectedModels[0] || ""}
        addedModelValues={selectedModels}
        multiSelect
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("addModelForCowork")}
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title={t("coworkManualConfiguration")}
        configs={getManualConfigs()}
      />
    </Card>
  );
}
