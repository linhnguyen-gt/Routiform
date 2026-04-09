"use client";

import { useState, useEffect } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import CliStatusBadge from "./CliStatusBadge";
import { useTranslations } from "next-intl";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

function parseModelList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function formatModelList(models) {
  return Array.isArray(models) ? models.join("\n") : "";
}

function normalizeModelItems(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))
    );
  }
  return parseModelList(value);
}

export default function OpenClawToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  hasActiveProviders,
  apiKeys,
  activeProviders,
  cloudEnabled,
  batchStatus,
  lastConfiguredAt,
}) {
  const t = useTranslations("cliTools");
  const [openclawStatus, setOpenclawStatus] = useState(null);
  const [checkingOpenclaw, setCheckingOpenclaw] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState([]);
  const [modelDraft, setModelDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  // Backups state
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(null);
  const cliReady = !!(openclawStatus?.installed && openclawStatus?.runnable);

  const getConfigStatus = () => {
    if (!cliReady) return null;
    const currentProvider = openclawStatus.settings?.models?.providers?.["routiform"];
    if (!currentProvider) return "not_configured";
    const localMatch =
      currentProvider.baseUrl?.includes("localhost") ||
      currentProvider.baseUrl?.includes("127.0.0.1");
    const cloudMatch = cloudEnabled && CLOUD_URL && currentProvider.baseUrl?.startsWith(CLOUD_URL);
    if (localMatch || cloudMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();

  // Use batch status as fallback when card hasn't been expanded yet
  const effectiveConfigStatus = configStatus || batchStatus?.configStatus || null;

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].key);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (isExpanded && !openclawStatus) {
      checkOpenclawStatus();
      fetchModelAliases();
      fetchBackups();
    }
  }, [isExpanded, openclawStatus]);

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  useEffect(() => {
    if (openclawStatus?.installed) {
      const provider = openclawStatus.settings?.models?.providers?.["routiform"];
      if (provider) {
        const configuredModels = Array.isArray(provider.models)
          ? provider.models
              .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
              .filter(Boolean)
          : [];
        const primaryModel = openclawStatus.settings?.agents?.defaults?.model?.primary;
        if (configuredModels.length > 0) {
          setSelectedModels(normalizeModelItems(configuredModels));
        } else if (primaryModel) {
          const modelId = primaryModel.replace("routiform/", "");
          setSelectedModels([modelId]);
        }
        if (provider.apiKey && apiKeys?.some((k) => k.key === provider.apiKey)) {
          setSelectedApiKey(provider.apiKey);
        }
      } else {
        setSelectedModels([]);
        setModelDraft("");
      }
    }
  }, [openclawStatus, apiKeys]);

  const commitDraftModels = (rawValue) => {
    const nextModels = normalizeModelItems([
      ...(selectedModels || []),
      ...parseModelList(rawValue),
    ]);
    setSelectedModels(nextModels);
    setModelDraft("");
  };

  const removeModel = (modelId) => {
    setSelectedModels((current) => current.filter((item) => item !== modelId));
  };

  const checkOpenclawStatus = async () => {
    setCheckingOpenclaw(true);
    try {
      const res = await fetch("/api/cli-tools/openclaw-settings");
      const data = await res.json();
      setOpenclawStatus(data);
    } catch (error) {
      setOpenclawStatus({ installed: false, error: error.message });
    } finally {
      setCheckingOpenclaw(false);
    }
  };

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const handleApplySettings = async () => {
    setApplying(true);
    setMessage(null);
    try {
      const keyToUse =
        selectedApiKey?.trim() ||
        (apiKeys?.length > 0 ? apiKeys[0].key : null) ||
        (!cloudEnabled ? "sk_routiform" : null);

      const res = await fetch("/api/cli-tools/openclaw-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
          model: selectedModels[0] || "",
          models: selectedModels,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("settingsApplied") });
        checkOpenclawStatus();
      } else {
        setMessage({ type: "error", text: data.error || t("failedApplySettings") });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const handleResetSettings = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/openclaw-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("settingsReset") });
        setSelectedModels([]);
        setModelDraft("");
        setSelectedApiKey("");
        checkOpenclawStatus();
      } else {
        setMessage({ type: "error", text: data.error || t("failedResetSettings") });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const handleModelSelect = (model) => {
    setSelectedModels((current) =>
      current.includes(model.value)
        ? current.filter((item) => item !== model.value)
        : normalizeModelItems([...current, model.value])
    );
  };

  // ── Backups ──
  const fetchBackups = async () => {
    try {
      const res = await fetch("/api/cli-tools/backups?tool=openclaw");
      const data = await res.json();
      if (res.ok) setBackups(data.backups || []);
    } catch (error) {
      console.log("Error fetching backups:", error);
    }
  };

  const handleRestoreBackup = async (backupId) => {
    setRestoringBackup(backupId);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "openclaw", backupId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("backupRestored") });
        checkOpenclawStatus();
        fetchBackups();
      } else {
        setMessage({ type: "error", text: data.error || t("failedRestore") });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoringBackup(null);
    }
  };

  const getManualConfigs = () => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_routiform"
          : "<API_KEY_FROM_DASHBOARD>";

    const primaryModel = selectedModels[0] || "provider/model-id";
    const settingsContent = {
      agents: {
        defaults: {
          model: {
            primary: `routiform/${primaryModel}`,
          },
        },
      },
      models: {
        providers: {
          routiform: {
            baseUrl: getEffectiveBaseUrl(),
            apiKey: keyToUse,
            api: "openai-completions",
            models: selectedModels.length
              ? selectedModels.map((modelId) => ({
                  id: modelId,
                  name: modelId.split("/").pop(),
                }))
              : [
                  {
                    id: primaryModel,
                    name: primaryModel.split("/").pop(),
                  },
                ],
          },
        },
      },
    };

    return [
      {
        filename: "~/.openclaw/openclaw.json",
        content: JSON.stringify(settingsContent, null, 2),
      },
    ];
  };

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image
              src="/providers/openclaw.png"
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
            <p className="text-xs text-text-muted truncate">{t("toolDescriptions.openclaw")}</p>
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
          {checkingOpenclaw && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>{t("checkingCli", { tool: "Open Claw" })}</span>
            </div>
          )}

          {!checkingOpenclaw && openclawStatus && !cliReady && (
            <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500">warning</span>
              <div className="flex-1">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  {openclawStatus.installed
                    ? t("cliNotRunnable", { tool: "Open Claw" })
                    : t("cliNotInstalled", { tool: "Open Claw" })}
                </p>
                <p className="text-sm text-text-muted">
                  {openclawStatus.installed
                    ? t("cliFoundFailedHealthcheck", {
                        tool: "Open Claw",
                        reason: openclawStatus.reason ? ` (${openclawStatus.reason})` : "",
                      })
                    : t("installCliPrompt", { tool: "Open Claw" })}
                </p>
              </div>
            </div>
          )}

          {!checkingOpenclaw && cliReady && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {openclawStatus?.settings?.models?.providers?.["routiform"]?.baseUrl && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                      {t("current")}
                    </span>
                    <span className="material-symbols-outlined text-text-muted text-[14px]">
                      arrow_forward
                    </span>
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {openclawStatus.settings.models.providers["routiform"].baseUrl}
                    </span>
                  </div>
                )}

                {/* Base URL */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("baseUrl")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <input
                    type="text"
                    value={getDisplayUrl()}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder={t("baseUrlPlaceholder")}
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {customBaseUrl && customBaseUrl !== baseUrl && (
                    <button
                      onClick={() => setCustomBaseUrl("")}
                      className="p-1 text-text-muted hover:text-primary rounded transition-colors"
                      title={t("resetToDefault")}
                    >
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                    </button>
                  )}
                </div>

                {/* API Key */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("apiKey")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  {apiKeys.length > 0 ? (
                    <select
                      value={selectedApiKey}
                      onChange={(e) => setSelectedApiKey(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {apiKeys.map((key) => (
                        <option key={key.id} value={key.key}>
                          {key.key}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      {cloudEnabled ? t("noApiKeysCreateOne") : t("defaultRoutiformKey")}
                    </span>
                  )}
                </div>

                {/* Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("model")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <div className="flex-1 rounded-xl border border-border bg-surface px-2 py-2 focus-within:ring-1 focus-within:ring-primary/50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedModels.map((modelId, index) => (
                        <button
                          key={modelId}
                          type="button"
                          onClick={() => removeModel(modelId)}
                          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${index === 0 ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-black/5 text-text-main dark:bg-white/5"}`}
                          title={index === 0 ? "Primary model" : t("clear")}
                        >
                          <span className="truncate max-w-[220px]">{modelId}</span>
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      ))}
                      <input
                        type="text"
                        value={modelDraft}
                        onChange={(e) => setModelDraft(e.target.value)}
                        onBlur={() => {
                          if (modelDraft.trim()) commitDraftModels(modelDraft);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            commitDraftModels(modelDraft);
                          }
                          if (e.key === "Backspace" && !modelDraft && selectedModels.length > 0) {
                            e.preventDefault();
                            removeModel(selectedModels[selectedModels.length - 1]);
                          }
                        }}
                        placeholder={
                          selectedModels.length === 0
                            ? `${t("providerModelPlaceholder")} + Enter`
                            : "Add model"
                        }
                        className="min-w-[180px] flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-text-muted"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setModalOpen(true)}
                    disabled={!hasActiveProviders}
                    className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    {t("selectModel")}
                  </button>
                  {(selectedModels.length > 0 || modelDraft.trim()) && (
                    <button
                      onClick={() => {
                        setSelectedModels([]);
                        setModelDraft("");
                      }}
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors"
                      title={t("clear")}
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                {selectedModels.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right"></span>
                    <span className="material-symbols-outlined text-transparent text-[14px]">
                      arrow_forward
                    </span>
                    <div className="flex-1 text-[11px] text-text-muted">
                      {`Primary: ${selectedModels[0]}`}
                    </div>
                  </div>
                )}
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

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplySettings}
                  disabled={selectedModels.length === 0}
                  loading={applying}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">save</span>
                  {t("apply")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  disabled={!openclawStatus?.hasRoutiform}
                  loading={restoring}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">restore</span>
                  {t("reset")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                  <span className="material-symbols-outlined text-[14px] mr-1">content_copy</span>
                  {t("manualConfig")}
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowBackups(!showBackups);
                    if (!showBackups) fetchBackups();
                  }}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">history</span>
                  {t("backups")}
                  {backups.length > 0 && ` (${backups.length})`}
                </Button>
              </div>

              {showBackups && (
                <div className="mt-2 p-3 bg-surface border border-border rounded-lg">
                  <h4 className="text-xs font-semibold text-text-main mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">history</span>
                    {t("configBackups")}
                  </h4>
                  {backups.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("noBackupsYet")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {backups.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-black/5 dark:bg-white/5 rounded text-xs"
                        >
                          <span className="material-symbols-outlined text-[14px] text-text-muted">
                            description
                          </span>
                          <span className="flex-1 truncate font-mono" title={b.id}>
                            {b.id}
                          </span>
                          <span className="text-text-muted whitespace-nowrap">
                            {new Date(b.createdAt).toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleRestoreBackup(b.id)}
                            disabled={restoringBackup === b.id}
                            className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {restoringBackup === b.id ? "..." : t("restore")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={selectedModels[0] || ""}
        addedModelValues={selectedModels}
        multiSelect
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("selectModelForTool", { tool: "Open Claw" })}
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title={t("openClawManualConfiguration")}
        configs={getManualConfigs()}
      />
    </Card>
  );
}
