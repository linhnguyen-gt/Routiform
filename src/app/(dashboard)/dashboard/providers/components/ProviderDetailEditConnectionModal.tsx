"use client";

import { Badge, Button, Input, Modal, Toggle } from "@/shared/components";
import {
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getCodexRequestDefaults as _getCodexRequestDefaults } from "@/lib/providers/requestDefaults";

import {
  XIAOMI_MIMO_TOKEN_PLAN_CLUSTERS,
  normalizeXiaomiTokenPlanClusterBaseUrl,
} from "@routiform/open-sse/config/xiaomiMimoTokenPlanClusters.ts";
import { normalizeAndValidateHttpBaseUrl } from "../providerDetailApiUtils";
import { ERROR_TYPE_LABELS } from "../providerDetailErrorUtils";
import type { EditConnectionModalProps } from "../[id]/types";
import { ProviderDetailExtraApiKeysField } from "./ProviderDetailExtraApiKeysField";

/**
 * UI adapter around the canonical getCodexRequestDefaults from requestDefaults.ts.
 * Keeps only service tier behavior at connection level.
 */
function getCodexRequestDefaults(providerSpecificData: unknown): {
  serviceTier?: "priority";
} {
  const defaults = _getCodexRequestDefaults(providerSpecificData);
  return {
    ...(defaults.serviceTier ? { serviceTier: defaults.serviceTier } : {}),
  };
}

export function ProviderDetailEditConnectionModal({
  isOpen,
  connection,
  onSave,
  onClose,
}: EditConnectionModalProps) {
  const t = useTranslations("providers");
  const [formData, setFormData] = useState({
    name: "",
    priority: 1,
    apiKey: "",
    healthCheckInterval: 60,
    baseUrl: "",
    region: "",
    apiRegion: "international",
    validationModelId: "",
    tag: "",
    customUserAgent: "",
    settingsCookie: "",
    codexFastServiceTier: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    diagnosis: { type: string } | null;
    message: string | null;
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"success" | "failed" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraApiKeys, setExtraApiKeys] = useState<string[]>([]);
  const [newExtraKey, setNewExtraKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // settingsCookie is write-only: the API never returns it, so the input starts
  // empty on every edit and an untouched save preserves the stored value.
  const [settingsCookieConfigured, setSettingsCookieConfigured] = useState(false);

  const isBailian = connection?.provider === "bailian-coding-plan";
  const isVertex = connection?.provider === "vertex";
  const isGlm = connection?.provider === "glm";
  const isCodex = connection?.provider === "codex";
  const isXiaomiTokenPlan = connection?.provider === "xiaomi-mimo-token-plan";
  const isOllamaCloud = connection?.provider === "ollama-cloud";
  const defaultBailianUrl = "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1";
  const defaultRegion = "us-central1";

  useEffect(() => {
    if (!connection) return;
    const rawBaseUrl =
      typeof connection.providerSpecificData?.baseUrl === "string"
        ? connection.providerSpecificData.baseUrl
        : "";
    const baseUrl = isXiaomiTokenPlan
      ? normalizeXiaomiTokenPlanClusterBaseUrl(rawBaseUrl)
      : rawBaseUrl;
    const region =
      typeof connection.providerSpecificData?.region === "string"
        ? connection.providerSpecificData.region
        : "";
    const customUserAgent =
      typeof connection.providerSpecificData?.customUserAgent === "string"
        ? connection.providerSpecificData.customUserAgent
        : "";
    const settingsCookieConfigured =
      typeof connection.providerSpecificData?.settingsCookie === "string" &&
      connection.providerSpecificData.settingsCookie.length > 0;
    const codexRequestDefaults = getCodexRequestDefaults(connection.providerSpecificData);
    setFormData({
      name: connection.name || "",
      priority: connection.priority || 1,
      apiKey: "",
      healthCheckInterval: connection.healthCheckInterval ?? 60,
      baseUrl: baseUrl || (isBailian ? defaultBailianUrl : ""),
      region: region || (isVertex ? defaultRegion : ""),
      apiRegion: (connection.providerSpecificData?.apiRegion as string) || "international",
      validationModelId: (connection.providerSpecificData?.validationModelId as string) || "",
      tag: (connection.providerSpecificData?.tag as string) || "",
      customUserAgent,
      settingsCookie: "",
      codexFastServiceTier: codexRequestDefaults.serviceTier === "priority",
    });
    const existing = connection.providerSpecificData?.extraApiKeys;
    setExtraApiKeys(Array.isArray(existing) ? existing : []);
    setNewExtraKey("");
    setShowAdvanced(!!customUserAgent);
    setTestResult(null);
    setValidationResult(null);
    setSettingsCookieConfigured(settingsCookieConfigured);
    setSaveError(null);
  }, [connection, isBailian, isVertex, isXiaomiTokenPlan, isOllamaCloud]);

  const validateApiKey = async () => {
    if (!connection?.provider || !formData.apiKey) return false;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection.provider,
          apiKey: formData.apiKey,
          validationModelId: formData.validationModelId || undefined,
          customUserAgent: formData.customUserAgent.trim() || undefined,
          ...(isXiaomiTokenPlan && formData.baseUrl.trim()
            ? { baseUrl: formData.baseUrl.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      const valid = !!data.valid;
      setValidationResult(valid ? "success" : "failed");
      return valid;
    } catch {
      setValidationResult("failed");
      return false;
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!connection) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updates: Record<string, unknown> = {
        name: formData.name,
        priority: formData.priority,
        healthCheckInterval: formData.healthCheckInterval,
      };
      let validatedBailianBaseUrl: string | null = null;
      let validatedXiaomiTokenPlanBaseUrl: string | null = null;
      if (isBailian) {
        const checked = normalizeAndValidateHttpBaseUrl(formData.baseUrl, defaultBailianUrl);
        if (checked.error) return setSaveError(checked.error);
        validatedBailianBaseUrl = checked.value;
      }
      if (isXiaomiTokenPlan) {
        const root = normalizeXiaomiTokenPlanClusterBaseUrl(formData.baseUrl);
        const allowed = new Set<string>(XIAOMI_MIMO_TOKEN_PLAN_CLUSTERS.map((c) => c.baseUrl));
        if (!root || !allowed.has(root)) {
          setSaveError("Select a Token Plan cluster (China, Singapore, or Europe).");
          setSaving(false);
          return;
        }
        validatedXiaomiTokenPlanBaseUrl = root;
      }
      const isOAuth = connection.authType === "oauth";
      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        const isValid = validationResult === "success" || (await validateApiKey());
        if (isValid)
          Object.assign(updates, {
            testStatus: "active",
            lastError: null,
            lastErrorAt: null,
            lastErrorType: null,
            lastErrorSource: null,
            errorCode: null,
            rateLimitedUntil: null,
          });
      }
      if (isOAuth) {
        updates.providerSpecificData = {
          ...(connection.providerSpecificData || {}),
          tag: formData.tag.trim() || undefined,
        };
      } else {
        const psd: Record<string, unknown> = {
          ...(connection.providerSpecificData || {}),
          extraApiKeys: extraApiKeys.filter((k) => k.trim().length > 0),
          tag: formData.tag.trim() || undefined,
          customUserAgent: formData.customUserAgent.trim(),
          validationModelId: formData.validationModelId || undefined,
        };
        if (isBailian) {
          psd.baseUrl = validatedBailianBaseUrl;
        } else if (isXiaomiTokenPlan && validatedXiaomiTokenPlanBaseUrl) {
          psd.baseUrl = validatedXiaomiTokenPlanBaseUrl;
        } else if (isVertex) {
          psd.region = formData.region;
        } else if (isGlm) {
          psd.apiRegion = formData.apiRegion;
        } else if (isOllamaCloud) {
          // Write-only field: an empty input means "keep the stored cookie" — omit
          // the key so the PUT merge preserves it. Clearing the cookie is done by
          // re-saving empty after removing it server-side (delete/re-add connection).
          if (formData.settingsCookie.trim()) {
            psd.settingsCookie = formData.settingsCookie.trim();
          }
        }
        updates.providerSpecificData = psd;
      }
      if (isCodex) {
        const providerSpecificData =
          (updates.providerSpecificData as Record<string, unknown> | undefined) || {};
        providerSpecificData.requestDefaults = {
          ...(formData.codexFastServiceTier ? { serviceTier: "priority" } : {}),
        };
        updates.providerSpecificData = providerSpecificData;
      }
      const error = await onSave(updates);
      if (error) setSaveError(typeof error === "string" ? error : t("failedSaveConnection"));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!connection?.provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${connection.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validationModelId: formData.validationModelId || undefined,
        }),
      });
      const data = await res.json();
      setTestResult({
        valid: !!data.valid,
        diagnosis: data.diagnosis || null,
        message: data.error || null,
      });
    } catch {
      setTestResult({
        valid: false,
        diagnosis: { type: "network_error" },
        message: t("failedTestConnection"),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!connection) return null;
  const isOAuth = connection.authType === "oauth";
  const isCompatible =
    isOpenAICompatibleProvider(connection.provider) ||
    isAnthropicCompatibleProvider(connection.provider);
  const testErrorMeta =
    !testResult?.valid && testResult?.diagnosis?.type
      ? ERROR_TYPE_LABELS[testResult.diagnosis.type] || null
      : null;

  return (
    <Modal isOpen={isOpen} title={t("editConnection")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label={t("nameLabel")}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isOAuth ? t("accountName") : t("productionKey")}
        />
        <Input
          label="Tag / Group"
          value={formData.tag}
          onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
          placeholder="e.g. personal, work, team-a"
          hint="Used to group accounts in the provider view"
        />
        {isCodex && (
          <div className="flex flex-col gap-4 rounded-lg border border-border/50 bg-surface/20 p-4">
            <Toggle
              checked={formData.codexFastServiceTier}
              onChange={(checked) => setFormData({ ...formData, codexFastServiceTier: checked })}
              label="Codex Fast Service Tier"
              description="When enabled, injects `service_tier=priority` for this connection if the client leaves the tier unset."
            />
          </div>
        )}
        {isOAuth && connection.email && (
          <div className="bg-sidebar/50 p-3 rounded-lg">
            <p className="text-sm text-text-muted mb-1">{t("email")}</p>
            <p className="font-medium">{connection.email}</p>
          </div>
        )}
        {isOAuth && (
          <Input
            label={t("healthCheckMinutes")}
            type="number"
            value={formData.healthCheckInterval}
            onChange={(e) =>
              setFormData({
                ...formData,
                healthCheckInterval: Math.max(0, Number.parseInt(e.target.value) || 0),
              })
            }
            hint={t("healthCheckHint")}
          />
        )}
        <Input
          label={t("priorityLabel")}
          type="number"
          value={formData.priority}
          onChange={(e) =>
            setFormData({
              ...formData,
              priority: Number.parseInt(e.target.value) || 1,
            })
          }
        />
        {isXiaomiTokenPlan && (
          <div>
            <label className="text-sm font-medium text-text-main mb-1 block">
              Token Plan cluster
            </label>
            <select
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            >
              <option value="">Select cluster…</option>
              {XIAOMI_MIMO_TOKEN_PLAN_CLUSTERS.map((c) => (
                <option key={c.id} value={c.baseUrl}>
                  {c.label}: {c.baseUrl}/
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              OpenAI vs Anthropic is chosen from the incoming chat request (endpoint / body), not
              here.
            </p>
          </div>
        )}
        {!isOAuth && (
          <>
            <div className="flex gap-2">
              <Input
                label={t("apiKeyLabel")}
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder={isVertex ? "Cole o Service Account JSON aqui" : t("enterNewApiKey")}
                hint={t("leaveBlankKeepCurrentApiKey")}
                className="flex-1"
              />
              <div className="pt-6">
                <Button
                  onClick={() => void validateApiKey()}
                  disabled={
                    !formData.apiKey ||
                    validating ||
                    saving ||
                    (isXiaomiTokenPlan && !formData.baseUrl.trim())
                  }
                  variant="secondary"
                >
                  {validating ? t("checking") : t("check")}
                </Button>
              </div>
            </div>
            {validationResult && (
              <Badge variant={validationResult === "success" ? "success" : "error"}>
                {validationResult === "success" ? t("valid") : t("invalid")}
              </Badge>
            )}
            {saveError && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {saveError}
              </div>
            )}
            <button
              type="button"
              className="text-sm text-text-muted hover:text-text-primary flex items-center gap-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              aria-controls="edit-connection-advanced-settings"
            >
              <span
                className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                aria-hidden="true"
              >
                ▶
              </span>
              {t("advancedSettings")}
            </button>
            {showAdvanced && (
              <div
                id="edit-connection-advanced-settings"
                className="flex flex-col gap-3 pl-2 border-l-2 border-border"
              >
                <Input
                  label="Custom User-Agent"
                  value={formData.customUserAgent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customUserAgent: e.target.value,
                    })
                  }
                  placeholder="my-app/1.0"
                  hint="Optional override sent upstream as the User-Agent header for this connection"
                />
              </div>
            )}
            <Input
              label="Model ID (opcional)"
              placeholder="ex: grok-3 ou meta-llama/Llama-3.1-8B-Instruct"
              value={formData.validationModelId}
              onChange={(e) => setFormData({ ...formData, validationModelId: e.target.value })}
              hint="Usado como fallback se a listagem de models não estiver disponível"
            />
          </>
        )}
        {isBailian && (
          <Input
            label="Base URL"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder={defaultBailianUrl}
            hint="Custom base URL for bailian-coding-plan provider"
          />
        )}
        {isVertex && (
          <Input
            label="Região (Region)"
            value={formData.region}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            placeholder={defaultRegion}
            hint="ex: us-central1 ou europe-west4. Partner models usam a região global automaticamente."
          />
        )}
        {isGlm && (
          <div>
            <label className="text-sm font-medium text-text-main mb-1 block">API Region</label>
            <select
              value={formData.apiRegion}
              onChange={(e) => setFormData({ ...formData, apiRegion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            >
              <option value="international">International (api.z.ai)</option>
              <option value="china">China Mainland (open.bigmodel.cn)</option>
            </select>
            <p className="text-xs text-text-muted mt-1">
              Select the endpoint region for API access and quota tracking.
            </p>
          </div>
        )}
        {isOllamaCloud && (
          <div>
            <Input
              label="Ollama session cookie"
              value={formData.settingsCookie}
              onChange={(e) => setFormData({ ...formData, settingsCookie: e.target.value })}
              placeholder={
                settingsCookieConfigured
                  ? "Configured (stored securely — leave blank to keep)"
                  : "session=eyJhbGciOi..."
              }
              hint="Optional — enables the Limits page to show Ollama Cloud usage. Open ollama.com/settings in a signed-in browser tab, DevTools → Network → any request → Copy the Cookie header, then paste it here. Stored encrypted; never shown back. Leave blank to keep the current value."
            />
          </div>
        )}
        {!isOAuth && (
          <ProviderDetailExtraApiKeysField
            extraApiKeys={extraApiKeys}
            newExtraKey={newExtraKey}
            setExtraApiKeys={setExtraApiKeys}
            setNewExtraKey={setNewExtraKey}
          />
        )}
        {!isCompatible && (
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} variant="secondary" disabled={testing}>
              {testing ? t("testing") : t("testConnection")}
            </Button>
            {testResult && (
              <>
                <Badge variant={testResult.valid ? "success" : "error"}>
                  {testResult.valid ? t("valid") : t("failed")}
                </Badge>
                {testErrorMeta && (
                  <Badge variant={testErrorMeta.variant as never}>
                    {t(testErrorMeta.labelKey)}
                  </Badge>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
