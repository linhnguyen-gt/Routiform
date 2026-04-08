"use client";

import { Badge, Button, Input, Modal } from "@/shared/components";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { normalizeAndValidateHttpBaseUrl } from "../providerDetailApiUtils";
import type { AddApiKeyModalProps } from "../[id]/types";

export function ProviderDetailAddApiKeyModal({
  isOpen,
  provider,
  providerName,
  isCompatible,
  isAnthropic,
  isCcCompatible,
  onSave,
  onClose,
}: AddApiKeyModalProps) {
  const t = useTranslations("providers");
  const isBailian = provider === "bailian-coding-plan";
  const isVertex = provider === "vertex";
  const isGlm = provider === "glm";
  const isQoder = provider === "qoder";
  const defaultBailianUrl = "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1";
  const defaultRegion = "us-central1";

  const [formData, setFormData] = useState({
    name: "",
    apiKey: "",
    priority: 1,
    baseUrl: isBailian ? defaultBailianUrl : "",
    region: isVertex ? defaultRegion : "",
    apiRegion: "international",
    validationModelId: "",
    customUserAgent: "",
  });
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"success" | "failed" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const validateKey = async (): Promise<boolean> => {
    try {
      setValidating(true);
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: formData.apiKey,
          validationModelId: formData.validationModelId || undefined,
          customUserAgent: formData.customUserAgent.trim() || undefined,
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
    if (!provider || !formData.apiKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      let validatedBailianBaseUrl: string | null = null;
      if (isBailian) {
        const checked = normalizeAndValidateHttpBaseUrl(formData.baseUrl, defaultBailianUrl);
        if (checked.error) return setSaveError(checked.error);
        validatedBailianBaseUrl = checked.value;
      }

      // Detect Qoder OAuth token (starts with 'pt-') and skip validation
      const trimmedApiKey = formData.apiKey.trim();
      const isQoderOAuthToken = isQoder && trimmedApiKey.startsWith("pt-");

      console.log('[Qoder Debug]', {
        provider,
        isQoder,
        trimmedApiKey: trimmedApiKey.substring(0, 10) + '...',
        startsWithPt: trimmedApiKey.startsWith("pt-"),
        isQoderOAuthToken
      });

      if (!isQoderOAuthToken) {
        const isValid = await validateKey();
        if (!isValid) return setSaveError(t("apiKeyValidationFailed"));
      } else {
        console.log('[Qoder Debug] Skipping validation for OAuth token');
      }

      const providerSpecificData: Record<string, unknown> = {};
      if (formData.customUserAgent.trim()) {
        providerSpecificData.customUserAgent = formData.customUserAgent.trim();
      }
      if (isBailian) providerSpecificData.baseUrl = validatedBailianBaseUrl;
      else if (isVertex) providerSpecificData.region = formData.region;
      else if (isGlm) providerSpecificData.apiRegion = formData.apiRegion;

      const payload: any = {
        name: formData.name,
        apiKey: trimmedApiKey,
        priority: formData.priority,
        testStatus: "active",
        providerSpecificData:
          Object.keys(providerSpecificData).length > 0 ? providerSpecificData : undefined,
      };

      // For Qoder OAuth tokens, set authType to 'oauth' and use accessToken field
      if (isQoderOAuthToken) {
        payload.authType = "oauth";
        payload.accessToken = trimmedApiKey;
        delete payload.apiKey;
      }

      const error = await onSave(payload);
      if (error) setSaveError(typeof error === "string" ? error : t("failedSaveConnection"));
    } finally {
      setSaving(false);
    }
  };

  if (!provider) return null;

  return (
    <Modal
      isOpen={isOpen}
      title={t("addProviderApiKeyTitle", { provider: providerName || provider })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t("nameLabel")}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isQoder ? "Qoder PAT" : t("productionKey")}
        />
        <div className="flex gap-2">
          <Input
            label={isQoder ? "Personal Access Token" : t("apiKeyLabel")}
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            className="flex-1"
            placeholder={
              isVertex
                ? "Cole o Service Account JSON aqui"
                : isQoder
                  ? "Paste your Qoder PAT or OAuth token (pt-...)"
                  : undefined
            }
            hint={
              isQoder
                ? "OAuth tokens (pt-...) are auto-detected and skip validation. PAT tokens are validated via qodercli."
                : undefined
            }
          />
          <div className="pt-6">
            <Button
              onClick={() => void validateKey()}
              disabled={!formData.apiKey || validating || saving}
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
        {isCompatible && (
          <p className="text-xs text-text-muted">
            {isCcCompatible
              ? "Validation uses the strict Claude Code-compatible bridge request for this provider."
              : isAnthropic
                ? t("validationChecksAnthropicCompatible", {
                    provider: providerName || t("anthropicCompatibleName"),
                  })
                : t("validationChecksOpenAiCompatible", {
                    provider: providerName || t("openaiCompatibleName"),
                  })}
          </p>
        )}
        <button
          type="button"
          className="text-sm text-text-muted hover:text-text-primary flex items-center gap-1"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="add-api-key-advanced-settings"
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
            id="add-api-key-advanced-settings"
            className="flex flex-col gap-3 pl-2 border-l-2 border-border"
          >
            <Input
              label="Custom User-Agent"
              value={formData.customUserAgent}
              onChange={(e) => setFormData({ ...formData, customUserAgent: e.target.value })}
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
        <Input
          label={t("priorityLabel")}
          type="number"
          value={formData.priority}
          onChange={(e) =>
            setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })
          }
        />
        {isBailian && (
          <Input
            label="Base URL"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder={defaultBailianUrl}
            hint="Optional: Custom base URL for bailian-coding-plan provider"
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
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={!formData.name || !formData.apiKey || saving}
          >
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
