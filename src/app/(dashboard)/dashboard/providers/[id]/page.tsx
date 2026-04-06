"use client";

import {
  compatibleProviderSupportsModelImport,
  getCompatibleFallbackModels,
} from "@/lib/providers/managedAvailableModels";
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
import {
  MODEL_COMPAT_PROTOCOL_KEYS,
  type ModelCompatProtocolKey,
} from "@/shared/constants/modelCompat";
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
import PropTypes from "prop-types";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CompatByProtocolMap = Partial<
  Record<
    ModelCompatProtocolKey,
    {
      normalizeToolCallId?: boolean;
      preserveOpenAIDeveloperRole?: boolean;
      upstreamHeaders?: Record<string, string>;
    }
  >
>;

/** PATCH fields for provider model compat (matches API + `ModelCompatPerProtocol` shape). */
type ModelCompatSavePatch = {
  normalizeToolCallId?: boolean;
  preserveOpenAIDeveloperRole?: boolean;
  upstreamHeaders?: Record<string, string>;
  compatByProtocol?: CompatByProtocolMap;
};

type CompatModelRow = {
  id?: string;
  name?: string;
  source?: string;
  apiFormat?: string;
  supportedEndpoints?: string[];
  normalizeToolCallId?: boolean;
  preserveOpenAIDeveloperRole?: boolean;
  upstreamHeaders?: Record<string, string>;
  compatByProtocol?: CompatByProtocolMap;
};

type CompatModelMap = Map<string, CompatModelRow>;

function buildCompatMap(rows: CompatModelRow[]): CompatModelMap {
  const m = new Map<string, CompatModelRow>();
  for (const r of rows) if (r.id) m.set(r.id, r);
  return m;
}

function getProtoSlice(
  c: CompatModelRow | undefined,
  o: CompatModelRow | undefined,
  protocol: string
) {
  return c?.compatByProtocol?.[protocol] ?? o?.compatByProtocol?.[protocol];
}

function effectiveNormalizeForProtocol(
  modelId: string,
  protocol: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): boolean {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  const pc = getProtoSlice(c, o, protocol);
  if (pc && Object.prototype.hasOwnProperty.call(pc, "normalizeToolCallId")) {
    return Boolean(pc.normalizeToolCallId);
  }
  if (c?.normalizeToolCallId) return true;
  return Boolean(o?.normalizeToolCallId);
}

function effectivePreserveForProtocol(
  modelId: string,
  protocol: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): boolean {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  const pc = getProtoSlice(c, o, protocol);
  if (pc && Object.prototype.hasOwnProperty.call(pc, "preserveOpenAIDeveloperRole")) {
    return Boolean(pc.preserveOpenAIDeveloperRole);
  }
  if (c && Object.prototype.hasOwnProperty.call(c, "preserveOpenAIDeveloperRole")) {
    return Boolean(c.preserveOpenAIDeveloperRole);
  }
  if (o && Object.prototype.hasOwnProperty.call(o, "preserveOpenAIDeveloperRole")) {
    return Boolean(o.preserveOpenAIDeveloperRole);
  }
  return true;
}

function anyNormalizeCompatBadge(
  modelId: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): boolean {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  if (c?.normalizeToolCallId || o?.normalizeToolCallId) return true;
  for (const p of MODEL_COMPAT_PROTOCOL_KEYS) {
    const pc = getProtoSlice(c, o, p);
    if (pc?.normalizeToolCallId) return true;
  }
  return false;
}

function anyNoPreserveCompatBadge(
  modelId: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): boolean {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  if (
    c &&
    Object.prototype.hasOwnProperty.call(c, "preserveOpenAIDeveloperRole") &&
    c.preserveOpenAIDeveloperRole === false
  ) {
    return true;
  }
  if (
    o &&
    Object.prototype.hasOwnProperty.call(o, "preserveOpenAIDeveloperRole") &&
    o.preserveOpenAIDeveloperRole === false
  ) {
    return true;
  }
  for (const p of MODEL_COMPAT_PROTOCOL_KEYS) {
    const pc = getProtoSlice(c, o, p);
    if (
      pc &&
      Object.prototype.hasOwnProperty.call(pc, "preserveOpenAIDeveloperRole") &&
      pc.preserveOpenAIDeveloperRole === false
    ) {
      return true;
    }
  }
  return false;
}

function upstreamHeadersRecordsEqual(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

type HeaderDraftRow = { id: string; name: string; value: string };

const UPSTREAM_HEADERS_UI_MAX = 16;

function recordToHeaderRows(rec: Record<string, string>, genId: () => string): HeaderDraftRow[] {
  const entries = Object.entries(rec).filter(([k]) => k.trim());
  if (entries.length === 0) return [{ id: genId(), name: "", value: "" }];
  return entries.map(([name, value]) => ({ id: genId(), name, value }));
}

function headerRowsToRecord(rows: HeaderDraftRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.name.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

type ProviderModelsApiErrorBody = {
  error?: {
    message?: string;
    details?: Array<{ field?: string; message?: string }>;
  };
};

async function formatProviderModelsErrorResponse(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ProviderModelsApiErrorBody;
    const err = data?.error;
    if (Array.isArray(err?.details) && err.details.length > 0) {
      return err.details
        .map((d) => {
          const f = typeof d.field === "string" && d.field ? d.field : "?";
          const m = typeof d.message === "string" ? d.message : "";
          return m ? `${f}: ${m}` : f;
        })
        .join("; ");
    }
    if (typeof err?.message === "string" && err.message.trim()) {
      return err.message.trim();
    }
  } catch {
    /* ignore */
  }
  const st = res.statusText?.trim();
  return st || `HTTP ${res.status}`;
}

function effectiveUpstreamHeadersForProtocol(
  modelId: string,
  protocol: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): Record<string, string> {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  const base: Record<string, string> = {};
  if (c?.upstreamHeaders && typeof c.upstreamHeaders === "object") {
    Object.assign(base, c.upstreamHeaders);
  } else if (o?.upstreamHeaders && typeof o.upstreamHeaders === "object") {
    Object.assign(base, o.upstreamHeaders);
  }
  const pc = getProtoSlice(c, o, protocol);
  if (pc?.upstreamHeaders && typeof pc.upstreamHeaders === "object") {
    Object.assign(base, pc.upstreamHeaders);
  }
  return base;
}

function anyUpstreamHeadersBadge(
  modelId: string,
  customMap: CompatModelMap,
  overrideMap: CompatModelMap
): boolean {
  const c = customMap.get(modelId);
  const o = overrideMap.get(modelId);
  const nonempty = (u: unknown) =>
    u && typeof u === "object" && !Array.isArray(u) && Object.keys(u as object).length > 0;
  if (nonempty(c?.upstreamHeaders) || nonempty(o?.upstreamHeaders)) return true;
  for (const p of MODEL_COMPAT_PROTOCOL_KEYS) {
    const pc = getProtoSlice(c, o, p);
    if (nonempty(pc?.upstreamHeaders)) return true;
  }
  return false;
}

interface ModelRowProps {
  model: { id: string };
  fullModel: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  showDeveloperToggle?: boolean;
  effectiveModelNormalize: (modelId: string, protocol?: string) => boolean;
  effectiveModelPreserveDeveloper: (modelId: string, protocol?: string) => boolean;
  saveModelCompatFlags: (modelId: string, patch: ModelCompatSavePatch) => void;
  getUpstreamHeadersRecord: (protocol: string) => Record<string, string>;
  compatDisabled?: boolean;
  testStatus?: "ok" | "error";
  onTest?: () => void;
  isTesting?: boolean;
}

interface PassthroughModelRowProps {
  modelId: string;
  fullModel: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onDeleteAlias: () => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  showDeveloperToggle?: boolean;
  effectiveModelNormalize: (modelId: string, protocol?: string) => boolean;
  effectiveModelPreserveDeveloper: (modelId: string, protocol?: string) => boolean;
  saveModelCompatFlags: (modelId: string, patch: ModelCompatSavePatch) => void;
  getUpstreamHeadersRecord: (protocol: string) => Record<string, string>;
  compatDisabled?: boolean;
  testStatus?: "ok" | "error";
  onTest?: () => void;
  isTesting?: boolean;
}

interface PassthroughModelsSectionProps {
  providerAlias: string;
  modelAliases: Record<string, string>;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onSetAlias: (modelId: string, alias: string) => Promise<void>;
  onDeleteAlias: (alias: string) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  effectiveModelNormalize: (alias: string) => boolean;
  effectiveModelPreserveDeveloper: (alias: string) => boolean;
  getUpstreamHeadersRecord: (modelId: string, protocol: string) => Record<string, string>;
  saveModelCompatFlags: (
    modelId: string,
    flags: {
      normalizeToolCallId?: boolean;
      preserveDeveloperRole?: boolean;
      preserveOpenAIDeveloperRole?: boolean;
    }
  ) => Promise<void>;
  compatSavingModelId?: string;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  onTestModel?: (fullModel: string) => void;
  canTestModels?: boolean;
}

interface CustomModelsSectionProps {
  providerId: string;
  providerAlias: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onModelsChanged?: () => void;
  onTestModel?: (fullModel: string) => Promise<boolean>;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  canTestModels?: boolean;
}

interface CompatibleModelsSectionProps {
  providerStorageAlias: string;
  providerDisplayAlias: string;
  modelAliases: Record<string, string>;
  fallbackModels?: CompatModelRow[];
  allowImport: boolean;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onSetAlias: (modelId: string, alias: string, providerStorageAlias?: string) => Promise<void>;
  onDeleteAlias: (alias: string) => void;
  connections: { id?: string; isActive?: boolean }[];
  isAnthropic?: boolean;
  onImportWithProgress: (
    fetchModels: () => Promise<{ models: unknown[] }>,
    processModel: (model: unknown) => Promise<boolean>
  ) => Promise<void>;
  t: (key: string, values?: Record<string, unknown>) => string;
  effectiveModelNormalize: (alias: string) => boolean;
  effectiveModelPreserveDeveloper: (alias: string) => boolean;
  getUpstreamHeadersRecord: (modelId: string, protocol: string) => Record<string, string>;
  saveModelCompatFlags: (
    modelId: string,
    flags: {
      normalizeToolCallId?: boolean;
      preserveDeveloperRole?: boolean;
      preserveOpenAIDeveloperRole?: boolean;
    }
  ) => Promise<void>;
  compatSavingModelId?: string;
  onModelsChanged?: () => void;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  onTestModel?: (fullModel: string) => void;
  canTestModels?: boolean;
}

interface CooldownTimerProps {
  until: string | number | Date;
}

interface ConnectionRowConnection {
  id?: string;
  name?: string;
  email?: string;
  displayName?: string;
  rateLimitedUntil?: string;
  rateLimitProtection?: boolean;
  testStatus?: string;
  isActive?: boolean;
  priority?: number;
  lastError?: string;
  lastErrorType?: string;
  lastErrorSource?: string;
  errorCode?: string | number;
  globalPriority?: number;
  providerSpecificData?: Record<string, unknown>;
  expiresAt?: string;
}

interface ConnectionRowProps {
  connection: ConnectionRowConnection;
  isOAuth: boolean;
  isCodex?: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: (isActive?: boolean) => void | Promise<void>;
  onToggleRateLimit: (enabled?: boolean) => void;
  onToggleCodex5h?: (enabled?: boolean) => void;
  onToggleCodexWeekly?: (enabled?: boolean) => void;
  onRetest: () => void;
  isRetesting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReauth?: () => void;
  onProxy?: () => void;
  hasProxy?: boolean;
  proxySource?: string;
  proxyHost?: string;
  onRefreshToken?: () => void;
  isRefreshing?: boolean;
  onApplyCodexAuthLocal?: () => void;
  isApplyingCodexAuthLocal?: boolean;
  onExportCodexAuthFile?: () => void;
  isExportingCodexAuthFile?: boolean;
  showBulkSelect?: boolean;
  bulkSelected?: boolean;
  onToggleBulkSelect?: () => void;
}

interface AddApiKeyModalProps {
  isOpen: boolean;
  provider?: string;
  providerName?: string;
  isCompatible?: boolean;
  isAnthropic?: boolean;
  isCcCompatible?: boolean;
  onSave: (data: {
    name: string;
    apiKey: string;
    priority: number;
    baseUrl?: string;
  }) => Promise<void | unknown>;
  onClose: () => void;
}

interface EditConnectionModalConnection {
  id?: string;
  name?: string;
  email?: string;
  priority?: number;
  authType?: string;
  provider?: string;
  providerSpecificData?: Record<string, unknown>;
  healthCheckInterval?: number;
}

interface EditConnectionModalProps {
  isOpen: boolean;
  connection: EditConnectionModalConnection | null;
  onSave: (data: unknown) => Promise<void | unknown>;
  onClose: () => void;
}

interface EditCompatibleNodeModalNode {
  id?: string;
  name?: string;
  prefix?: string;
  apiType?: string;
  baseUrl?: string;
  chatPath?: string;
  modelsPath?: string;
}

interface EditCompatibleNodeModalProps {
  isOpen: boolean;
  node: EditCompatibleNodeModalNode | null;
  onSave: (data: unknown) => Promise<void>;
  onClose: () => void;
  isAnthropic?: boolean;
  isCcCompatible?: boolean;
}

const CC_COMPATIBLE_LABEL = "CC Compatible";
const CC_COMPATIBLE_DETAILS_TITLE = "CC Compatible Details";
const CC_COMPATIBLE_DEFAULT_CHAT_PATH = "/v1/messages?beta=true";

function normalizeCodexLimitPolicy(policy: unknown): { use5h: boolean; useWeekly: boolean } {
  const record =
    policy && typeof policy === "object" && !Array.isArray(policy)
      ? (policy as Record<string, unknown>)
      : {};
  return {
    use5h: typeof record.use5h === "boolean" ? record.use5h : true,
    useWeekly: typeof record.useWeekly === "boolean" ? record.useWeekly : true,
  };
}

function compatProtocolLabelKey(protocol: string): string {
  if (protocol === "openai") return "compatProtocolOpenAI";
  if (protocol === "openai-responses") return "compatProtocolOpenAIResponses";
  if (protocol === "claude") return "compatProtocolClaude";
  return "compatProtocolOpenAI";
}

function ModelCompatPopover({
  t,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecord,
  onCompatPatch,
  showDeveloperToggle = true,
  disabled,
}: {
  t: (key: string) => string;
  effectiveModelNormalize: (protocol: string) => boolean;
  effectiveModelPreserveDeveloper: (protocol: string) => boolean;
  getUpstreamHeadersRecord: (protocol: string) => Record<string, string>;
  onCompatPatch: (
    protocol: string,
    payload: {
      normalizeToolCallId?: boolean;
      preserveOpenAIDeveloperRole?: boolean;
      upstreamHeaders?: Record<string, string>;
    }
  ) => void;
  showDeveloperToggle?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [protocol, setProtocol] = useState<string>(MODEL_COMPAT_PROTOCOL_KEYS[0]);
  const [headerRows, setHeaderRows] = useState<HeaderDraftRow[]>([]);
  const [valuePeekRowId, setValuePeekRowId] = useState<string | null>(null);
  const [valueFocusRowId, setValueFocusRowId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [portalPanelRect, setPortalPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const headerRowIdRef = useRef(0);
  const headerRowsRef = useRef<HeaderDraftRow[]>([]);
  headerRowsRef.current = headerRows;

  const genHeaderRowId = () => {
    headerRowIdRef.current += 1;
    return `uh-${headerRowIdRef.current}`;
  };

  const normalizeToolCallId = effectiveModelNormalize(protocol);
  const preserveDeveloperRole = effectiveModelPreserveDeveloper(protocol);
  const devToggle = showDeveloperToggle && protocol !== "claude";

  const tryCommitHeaderRows = useCallback(
    (rows: HeaderDraftRow[]) => {
      const parsed = headerRowsToRecord(rows);
      const current = getUpstreamHeadersRecord(protocol);
      if (upstreamHeadersRecordsEqual(parsed, current)) return;
      onCompatPatch(protocol, { upstreamHeaders: parsed });
    },
    [getUpstreamHeadersRecord, onCompatPatch, protocol]
  );

  const onHeaderFieldBlur = useCallback(() => {
    queueMicrotask(() => tryCommitHeaderRows(headerRowsRef.current));
  }, [tryCommitHeaderRows]);

  useEffect(() => {
    if (!open) return;
    return () => {
      tryCommitHeaderRows(headerRowsRef.current);
    };
  }, [open, tryCommitHeaderRows]);

  useEffect(() => {
    if (!open) return;
    const rec = getUpstreamHeadersRecord(protocol);
    setHeaderRows(recordToHeaderRows(rec, genHeaderRowId));
    // Only re-load rows when opening or switching protocol — not when the parent passes a new
    // inline callback every render (would wipe in-progress edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [open, protocol]);

  useEffect(() => {
    setValuePeekRowId(null);
    setValueFocusRowId(null);
  }, [open, protocol]);

  const namedHeaderCount = headerRows.filter((r) => r.name.trim()).length;
  const canAddHeaderRow = namedHeaderCount < UPSTREAM_HEADERS_UI_MAX;

  const updateHeaderRow = (id: string, patch: Partial<Pick<HeaderDraftRow, "name" | "value">>) => {
    setHeaderRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addHeaderRow = () => {
    if (!canAddHeaderRow) return;
    setHeaderRows((prev) => [...prev, { id: genHeaderRowId(), name: "", value: "" }]);
  };

  const removeHeaderRow = (id: string) => {
    setHeaderRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      const normalized = next.length === 0 ? [{ id: genHeaderRowId(), name: "", value: "" }] : next;
      queueMicrotask(() => tryCommitHeaderRows(normalized));
      return normalized;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = ref.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const updatePortalPanelRect = useCallback(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(window.innerWidth - 2 * margin, 24 * 16);
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    setPortalPanelRect({ top: rect.bottom + 8, left, width });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPortalPanelRect(null);
      return;
    }
    updatePortalPanelRect();
    window.addEventListener("resize", updatePortalPanelRect);
    window.addEventListener("scroll", updatePortalPanelRect, true);
    return () => {
      window.removeEventListener("resize", updatePortalPanelRect);
      window.removeEventListener("scroll", updatePortalPanelRect, true);
    };
  }, [open, updatePortalPanelRect]);

  const panelChromeClass =
    "flex max-h-[min(82vh,42rem)] flex-col overflow-hidden rounded-xl border-2 border-zinc-200 bg-white shadow-2xl dark:border-zinc-600 dark:bg-zinc-950";

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background text-text-muted hover:bg-muted hover:text-text-main disabled:opacity-50 transition-colors"
        title={t("compatAdjustmentsTitle")}
      >
        <span className="material-symbols-outlined text-base leading-none">tune</span>
        {t("compatButtonLabel")}
      </button>
      {open &&
        typeof document !== "undefined" &&
        portalPanelRect &&
        createPortal(
          <div
            ref={panelRef}
            className={panelChromeClass}
            style={{
              position: "fixed",
              top: portalPanelRect.top,
              left: portalPanelRect.left,
              width: portalPanelRect.width,
              zIndex: 10040,
            }}
          >
            <div className="shrink-0 border-b-2 border-zinc-200 bg-zinc-100 px-3 py-2.5 dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-xs font-semibold text-text-main">{t("compatAdjustmentsTitle")}</p>
              <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                {t("compatProtocolHint")}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-3 [scrollbar-gutter:stable] [scrollbar-width:thin] dark:bg-zinc-950">
              <label className="block text-[11px] font-medium text-text-muted mb-1.5">
                {t("compatProtocolLabel")}
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                disabled={disabled}
                className="mb-4 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs text-text-main focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900"
              >
                {MODEL_COMPAT_PROTOCOL_KEYS.map((p) => (
                  <option key={p} value={p}>
                    {t(compatProtocolLabelKey(p))}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-3.5">
                <Toggle
                  size="sm"
                  label={t("compatToolIdShort")}
                  title={t("normalizeToolCallIdLabel")}
                  checked={normalizeToolCallId}
                  onChange={(v) => onCompatPatch(protocol, { normalizeToolCallId: v })}
                  disabled={disabled}
                />
                {devToggle && (
                  <Toggle
                    size="sm"
                    label={t("compatDoNotPreserveDeveloper")}
                    title={t("preserveDeveloperRoleLabel")}
                    checked={preserveDeveloperRole === false}
                    onChange={(checked) =>
                      onCompatPatch(protocol, { preserveOpenAIDeveloperRole: !checked })
                    }
                    disabled={disabled}
                  />
                )}
              </div>

              <div className="mt-4 rounded-lg border-2 border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-600 dark:bg-zinc-900">
                <label className="block text-[11px] font-semibold text-text-main mb-1">
                  {t("compatUpstreamHeadersLabel")}
                </label>
                <p className="text-[11px] text-text-muted mb-3 leading-relaxed">
                  {t("compatUpstreamHeadersHint")}
                </p>
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 items-end text-[10px] font-medium uppercase tracking-wide text-text-muted px-0.5">
                    <span>{t("compatUpstreamHeaderName")}</span>
                    <span className="col-span-1">{t("compatUpstreamHeaderValue")}</span>
                    <span className="w-8 shrink-0" aria-hidden />
                  </div>
                  {headerRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 items-center"
                    >
                      <Input
                        value={row.name}
                        onChange={(e) => updateHeaderRow(row.id, { name: e.target.value })}
                        onBlur={onHeaderFieldBlur}
                        disabled={disabled}
                        placeholder="Authentication"
                        className="gap-0 min-w-0"
                        inputClassName="h-9 bg-white py-1.5 px-2 text-xs font-mono dark:bg-zinc-900"
                        autoComplete="off"
                      />
                      <div
                        className="min-w-0"
                        onMouseEnter={() => setValuePeekRowId(row.id)}
                        onMouseLeave={() =>
                          setValuePeekRowId((cur) => (cur === row.id ? null : cur))
                        }
                      >
                        <Input
                          type={
                            valuePeekRowId === row.id || valueFocusRowId === row.id
                              ? "text"
                              : "password"
                          }
                          value={row.value}
                          onChange={(e) => updateHeaderRow(row.id, { value: e.target.value })}
                          onFocus={() => setValueFocusRowId(row.id)}
                          onBlur={() => {
                            setValueFocusRowId((cur) => (cur === row.id ? null : cur));
                            onHeaderFieldBlur();
                          }}
                          disabled={disabled}
                          placeholder="•••"
                          className="gap-0 min-w-0"
                          inputClassName="h-9 bg-white py-1.5 px-2 text-xs dark:bg-zinc-900"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={disabled || headerRows.length <= 1}
                        onClick={() => removeHeaderRow(row.id)}
                        title={t("compatUpstreamRemoveRow")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 text-text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg leading-none">
                          close
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={disabled || !canAddHeaderRow}
                  onClick={addHeaderRow}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <span className="material-symbols-outlined text-base leading-none">add</span>
                  {t("compatUpstreamAddRow")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providerNode, setProviderNode] = useState(null);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  /** Server-backed: Qoder browser OAuth only when QODER_OAUTH_* is fully configured */
  const [qoderBrowserOAuthEnabled, setQoderBrowserOAuthEnabled] = useState<null | boolean>(null);
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
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([]);
  const [bulkDeletingConnections, setBulkDeletingConnections] = useState(false);
  const [importingModels, setImportingModels] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    phase: "idle" as "idle" | "fetching" | "importing" | "done" | "error",
    status: "",
    logs: [] as string[],
    error: "",
    importedCount: 0,
  });
  const [modelMeta, setModelMeta] = useState<{
    customModels: CompatModelRow[];
    modelCompatOverrides: Array<CompatModelRow & { id: string }>;
  }>({ customModels: [], modelCompatOverrides: [] });
  const [syncedAvailableModels, setSyncedAvailableModels] = useState<any[]>([]);
  const [compatSavingModelId, setCompatSavingModelId] = useState<string | null>(null);
  const [applyingCodexAuthId, setApplyingCodexAuthId] = useState<string | null>(null);
  const [exportingCodexAuthId, setExportingCodexAuthId] = useState<string | null>(null);
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
  const allowQoderOAuthUi = providerId !== "qoder" || qoderBrowserOAuthEnabled === true;
  const registryModels = getModelsByProviderId(providerId);
  // For Gemini: always use synced API models (empty if no keys added yet)
  const models = providerId === "gemini" ? syncedAvailableModels : registryModels;
  const providerAlias = getProviderAlias(providerId);
  const isManagedAvailableModelsProvider = isCompatible || providerId === "openrouter";
  const isSearchProvider = providerId.endsWith("-search");
  const compatibleSupportsModelImport = compatibleProviderSupportsModelImport(providerId);

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

  useEffect(() => {
    if (providerId !== "qoder") {
      setQoderBrowserOAuthEnabled(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/oauth/feature-flags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.qoderBrowserOAuthEnabled === "boolean") {
          setQoderBrowserOAuthEnabled(data.qoderBrowserOAuthEnabled);
        } else {
          setQoderBrowserOAuthEnabled(false);
        }
      })
      .catch(() => {
        if (!cancelled) setQoderBrowserOAuthEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => {
    if (providerId === "qoder" && qoderBrowserOAuthEnabled === false && showOAuthModal) {
      setShowOAuthModal(false);
    }
  }, [providerId, qoderBrowserOAuthEnabled, showOAuthModal]);

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

  const toggleConnectionBulkSelect = useCallback((id: string) => {
    setSelectedConnectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleSelectAllConnections = useCallback(() => {
    setSelectedConnectionIds((prev) => {
      if (sortedConnectionIds.length === 0) return [];
      const allSelected = sortedConnectionIds.every((sid) => prev.includes(sid));
      if (allSelected) return [];
      return [...sortedConnectionIds];
    });
  }, [sortedConnectionIds]);

  useEffect(() => {
    const valid = new Set(
      connections
        .map((c: { id?: string }) => c.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    setSelectedConnectionIds((prev) => prev.filter((id) => valid.has(id)));
  }, [connections]);

  useEffect(() => {
    const el = selectAllConnectionsRef.current;
    if (!el) return;
    const some = selectedConnectionIds.some((id) => sortedConnectionIds.includes(id));
    const all =
      sortedConnectionIds.length > 0 &&
      sortedConnectionIds.every((id) => selectedConnectionIds.includes(id));
    el.indeterminate = some && !all;
  }, [selectedConnectionIds, sortedConnectionIds]);

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
  }, [selectedConnectionIds, sortedConnectionIds, t, notify, providerId, fetchProviderModelMeta]);

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
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: fullModel }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          latencyMs?: number;
          error?: string;
        };
        const ok = Boolean(data.ok);
        success = ok;
        setModelTestResults((prev) => ({ ...prev, [fullModel]: ok ? "ok" : "error" }));
        if (ok) {
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
    [connections.length, notify, t]
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

        // For Gemini: show progress dialog and sync models from endpoint
        if (providerId === "gemini" && newConnection?.id) {
          setShowImportModal(true);
          setImportProgress({
            current: 0,
            total: 0,
            phase: "fetching",
            status: t("fetchingModels"),
            logs: [],
            error: "",
            importedCount: 0,
          });

          try {
            const syncRes = await fetch(`/api/providers/${newConnection.id}/sync-models`, {
              method: "POST",
              signal: AbortSignal.timeout(30_000), // 30s timeout — model sync shouldn't hang
            });
            const syncData = await syncRes.json();

            if (!syncRes.ok || syncData.error) {
              setImportProgress((prev) => ({
                ...prev,
                phase: "error",
                status: t("failedFetchModels"),
                error: syncData.error?.message || syncData.error || t("failedImportModels"),
              }));
              return null;
            }

            const syncedCount = syncData.syncedModels || 0;
            const syncedModelList: Array<{ id: string; name?: string }> = syncData.models || [];
            const logs: string[] = [];
            if (syncedModelList.length > 0) {
              logs.push(`✓ ${syncedCount} models available`);
              logs.push("");
              for (const m of syncedModelList) {
                logs.push(`  ${m.name || m.id}`);
              }
            }

            setImportProgress((prev) => ({
              ...prev,
              phase: "done",
              status: t("modelsImported", { count: syncedCount }),
              total: syncedCount,
              current: syncedCount,
              importedCount: syncedCount,
              logs,
            }));

            await fetchProviderModelMeta();
          } catch (syncError) {
            setImportProgress((prev) => ({
              ...prev,
              phase: "error",
              status: t("failedFetchModels"),
              error: String(syncError),
            }));
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

  const handleImportModels = async () => {
    if (importingModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImportingModels(true);
    setShowImportModal(true);
    setImportProgress({
      current: 0,
      total: 0,
      phase: "fetching",
      status: t("fetchingModels"),
      logs: [],
      error: "",
      importedCount: 0,
    });

    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        setImportProgress((prev) => ({
          ...prev,
          phase: "error",
          status: t("failedFetchModels"),
          error: data.error || t("failedImportModels"),
        }));
        return;
      }
      const fetchedModels = data.models || [];
      if (fetchedModels.length === 0) {
        setImportProgress((prev) => ({
          ...prev,
          phase: "done",
          status: t("noModelsFound"),
          logs: [t("noModelsReturnedFromEndpoint")],
        }));
        return;
      }

      const existingIds = new Set([
        ...(modelMeta.customModels || []).map((m: any) => m.id),
        ...models.map((m: any) => m.id),
      ]);
      const newModels = fetchedModels.filter(
        (model: any) => !existingIds.has(model.id || model.name || model.model)
      );

      if (newModels.length === 0) {
        setImportProgress((prev) => ({
          ...prev,
          phase: "done",
          status: t("allModelsAlreadyImported") || "All models already imported",
          logs: [t("noNewModelsToImport") || "No new models to import"],
          importedCount: 0,
          total: 0,
          current: 0,
        }));
        return;
      }

      setImportProgress((prev) => ({
        ...prev,
        phase: "importing",
        total: newModels.length,
        current: 0,
        status: t("importingModelsProgress", { current: 0, total: newModels.length }),
        logs: [
          t("foundModelsStartingImport", { count: newModels.length }),
          ...(newModels.length < fetchedModels.length
            ? [
                t("skippingExistingModels", { count: fetchedModels.length - newModels.length }) ||
                  `Skipping ${fetchedModels.length - newModels.length} existing models`,
              ]
            : []),
        ],
      }));

      let importedCount = 0;
      for (let i = 0; i < newModels.length; i++) {
        const model = newModels[i];
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        const parts = modelId.split("/");
        const baseAlias = parts[parts.length - 1];

        setImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          status: t("importingModelsProgress", { current: i + 1, total: newModels.length }),
          logs: [...prev.logs, t("importingModelById", { modelId })],
        }));

        // Save as imported (default) model in the DB
        await fetch("/api/provider-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: providerId,
            modelId,
            modelName: model.name || modelId,
            source: "imported",
          }),
        });
        // Also create an alias for routing
        if (!modelAliases[baseAlias]) {
          await handleSetAlias(modelId, baseAlias, providerStorageAlias);
        }
        importedCount += 1;
      }

      await fetchAliases();

      setImportProgress((prev) => ({
        ...prev,
        phase: "done",
        current: newModels.length,
        status:
          importedCount > 0
            ? t("importSuccessCount", { count: importedCount })
            : t("noNewModelsAddedExisting"),
        logs: [
          ...prev.logs,
          importedCount > 0
            ? t("importDoneCount", { count: importedCount })
            : t("noNewModelsAdded"),
        ],
        importedCount,
      }));

      // Auto-reload after success
      if (importedCount > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.log("Error importing models:", error);
      setImportProgress((prev) => ({
        ...prev,
        phase: "error",
        status: t("importFailed"),
        error: error instanceof Error ? error.message : t("unexpectedErrorOccurred"),
      }));
    } finally {
      setImportingModels(false);
    }
  };

  // Shared import handler for CompatibleModelsSection
  const handleCompatibleImportWithProgress = async (
    fetchModels: () => Promise<{ models: any[] }>,
    processModel: (model: any) => Promise<boolean>
  ) => {
    setShowImportModal(true);
    setImportProgress({
      current: 0,
      total: 0,
      phase: "fetching",
      status: t("fetchingModels"),
      logs: [],
      error: "",
      importedCount: 0,
    });

    try {
      const data = await fetchModels();
      const models = data.models || [];
      if (models.length === 0) {
        setImportProgress((prev) => ({
          ...prev,
          phase: "done",
          status: t("noModelsFound"),
          logs: [t("noModelsReturnedFromEndpoint")],
        }));
        return;
      }

      setImportProgress((prev) => ({
        ...prev,
        phase: "importing",
        total: models.length,
        status: t("importingModelsProgress", { current: 0, total: models.length }),
        logs: [t("foundModelsStartingImport", { count: models.length })],
      }));

      let importedCount = 0;
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;

        setImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          status: t("importingModelsProgress", { current: i + 1, total: models.length }),
          logs: [...prev.logs, t("importingModelById", { modelId })],
        }));

        const added = await processModel(model);
        if (added) importedCount += 1;
      }

      setImportProgress((prev) => ({
        ...prev,
        phase: "done",
        current: models.length,
        status:
          importedCount > 0
            ? t("importSuccessCount", { count: importedCount })
            : t("noNewModelsAdded"),
        logs: [
          ...prev.logs,
          importedCount > 0
            ? t("importDoneCount", { count: importedCount })
            : t("noNewModelsAdded"),
        ],
        importedCount,
      }));

      if (importedCount > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.log("Error importing models:", error);
      setImportProgress((prev) => ({
        ...prev,
        phase: "error",
        status: t("importFailed"),
        error: error instanceof Error ? error.message : t("unexpectedErrorOccurred"),
      }));
    }
  };

  const canImportModels = connections.some((conn) => conn.isActive !== false);

  // Auto-sync toggle state: read from first active connection's providerSpecificData
  const autoSyncConnection = connections.find((conn: any) => conn.isActive !== false);
  const isAutoSyncEnabled = !!(autoSyncConnection as any)?.providerSpecificData?.autoSync;
  const [togglingAutoSync, setTogglingAutoSync] = useState(false);

  const handleToggleAutoSync = async () => {
    if (!autoSyncConnection || togglingAutoSync) return;
    setTogglingAutoSync(true);
    try {
      const newValue = !isAutoSyncEnabled;
      await fetch(`/api/providers/${(autoSyncConnection as any).id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSpecificData: { autoSync: newValue },
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

    const autoSyncToggle = compatibleSupportsModelImport && canImportModels && (
      <button
        onClick={handleToggleAutoSync}
        disabled={togglingAutoSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-transparent cursor-pointer text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
        title={t("autoSyncTooltip")}
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
            onImportWithProgress={handleCompatibleImportWithProgress}
            t={t}
            effectiveModelNormalize={effectiveModelNormalize}
            effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
            getUpstreamHeadersRecord={getUpstreamHeadersRecordForModel}
            saveModelCompatFlags={saveModelCompatFlags}
            compatSavingModelId={compatSavingModelId}
            onModelsChanged={fetchProviderModelMeta}
            allowImport={compatibleSupportsModelImport}
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
            <Button
              size="sm"
              variant="secondary"
              icon="download"
              onClick={handleImportModels}
              disabled={!canImportModels || importingModels}
            >
              {importingModels ? t("importingModels") : t("importFromModels")}
            </Button>
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

    const importButton =
      providerId === "gemini" ? null : (
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
          <Button
            size="sm"
            variant="secondary"
            icon="download"
            onClick={handleImportModels}
            disabled={!canImportModels || importingModels}
          >
            {importingModels ? t("importingModels") : t("importFromModels")}
          </Button>
          {autoSyncToggle}
          {!canImportModels && (
            <span className="text-xs text-text-muted">{t("addConnectionToImport")}</span>
          )}
        </div>
      );

    if (models.length === 0) {
      return (
        <div>
          {modelTestBanner}
          {importButton}
          <p className="text-sm text-text-muted">{t("noModelsConfigured")}</p>
        </div>
      );
    }
    return (
      <div>
        {modelTestBanner}
        {importButton}
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
                <Button size="sm" icon="add" onClick={openPrimaryAddFlow}>
                  {providerSupportsPat ? "Add PAT" : t("add")}
                </Button>
                {providerId === "qoder" && qoderBrowserOAuthEnabled === true && (
                  <Button size="sm" variant="secondary" onClick={() => setShowOAuthModal(true)}>
                    Browser OAuth
                  </Button>
                )}
              </>
            ) : (
              connections.length === 0 && (
                <Button size="sm" icon="add" onClick={() => setShowAddApiKeyModal(true)}>
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
                {providerId === "qoder" && qoderBrowserOAuthEnabled === true && (
                  <Button variant="secondary" onClick={() => setShowOAuthModal(true)}>
                    Browser OAuth
                  </Button>
                )}
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
                      <ConnectionRow
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
                            <ConnectionRow
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
          isOpen={showOAuthModal && (providerId !== "qoder" || qoderBrowserOAuthEnabled === true)}
          provider={providerId}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => {
            setShowOAuthModal(false);
          }}
        />
      )}
      <AddApiKeyModal
        isOpen={showAddApiKeyModal}
        provider={providerId}
        providerName={providerInfo.name}
        isCompatible={isCompatible}
        isAnthropic={isAnthropicProtocolCompatible}
        isCcCompatible={isCcCompatible}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddApiKeyModal(false)}
      />
      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />
      {isCompatible && (
        <EditCompatibleNodeModal
          isOpen={showEditNodeModal}
          node={providerNode}
          onSave={handleUpdateNode}
          onClose={() => setShowEditNodeModal(false)}
          isAnthropic={isAnthropicProtocolCompatible}
          isCcCompatible={isCcCompatible}
        />
      )}
      {/* Batch Test Results Modal */}
      {batchTestResults && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          onClick={() => setBatchTestResults(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-bg-primary border border-border rounded-xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-bg-primary/95 backdrop-blur-sm rounded-t-xl">
              <h3 className="font-semibold">{t("testResults")}</h3>
              <button
                onClick={() => setBatchTestResults(null)}
                className="p-1 rounded-lg hover:bg-bg-subtle text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5">
              {batchTestResults.error &&
              (!batchTestResults.results || batchTestResults.results.length === 0) ? (
                <div className="text-center py-6">
                  <span className="material-symbols-outlined text-red-500 text-[32px] mb-2 block">
                    error
                  </span>
                  <p className="text-sm text-red-400">{String(batchTestResults.error)}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {batchTestResults.summary && (
                    <div className="flex items-center gap-3 text-xs mb-1">
                      <span className="text-text-muted">{providerInfo?.name || providerId}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                        {t("passedCount", { count: batchTestResults.summary.passed })}
                      </span>
                      {batchTestResults.summary.failed > 0 && (
                        <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
                          {t("failedCount", { count: batchTestResults.summary.failed })}
                        </span>
                      )}
                      <span className="text-text-muted ml-auto">
                        {t("testedCount", { count: batchTestResults.summary.total })}
                      </span>
                    </div>
                  )}
                  {(batchTestResults.results || []).map((r: any, i: number) => (
                    <div
                      key={r.connectionId || i}
                      className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]"
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] ${
                          r.valid ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {r.valid ? "check_circle" : "error"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.connectionName}</span>
                      </div>
                      {r.latencyMs !== undefined && (
                        <span className="text-text-muted font-mono tabular-nums">
                          {t("millisecondsAbbr", { value: r.latencyMs })}
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          r.valid
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {r.valid ? t("okShort") : r.diagnosis?.type || t("errorShort")}
                      </span>
                    </div>
                  ))}
                  {(!batchTestResults.results || batchTestResults.results.length === 0) && (
                    <div className="text-center py-4 text-text-muted text-sm">
                      {t("noActiveConnectionsInGroup")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
      {/* Import Progress Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          if (importProgress.phase === "done" || importProgress.phase === "error") {
            setShowImportModal(false);
          }
        }}
        title={t("importingModelsTitle")}
        size="md"
        closeOnOverlay={false}
        showCloseButton={importProgress.phase === "done" || importProgress.phase === "error"}
      >
        <div className="flex flex-col gap-4">
          {/* Status text */}
          <div className="flex items-center gap-3">
            {importProgress.phase === "fetching" && (
              <span className="material-symbols-outlined text-primary animate-spin">
                progress_activity
              </span>
            )}
            {importProgress.phase === "importing" && (
              <span className="material-symbols-outlined text-primary animate-spin">
                progress_activity
              </span>
            )}
            {importProgress.phase === "done" && (
              <span className="material-symbols-outlined text-green-500">check_circle</span>
            )}
            {importProgress.phase === "error" && (
              <span className="material-symbols-outlined text-red-500">error</span>
            )}
            <span className="text-sm font-medium text-text-main">{importProgress.status}</span>
          </div>

          {/* Progress bar */}
          {(importProgress.phase === "importing" || importProgress.phase === "done") &&
            importProgress.total > 0 && (
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">
                    {importProgress.current} / {importProgress.total}
                  </span>
                  <span className="text-xs text-text-muted">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                      background:
                        importProgress.phase === "done"
                          ? "linear-gradient(90deg, #22c55e, #16a34a)"
                          : "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover, var(--color-primary)))",
                    }}
                  />
                </div>
              </div>
            )}

          {/* Fetching indeterminate bar */}
          {importProgress.phase === "fetching" && (
            <div className="w-full h-2.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  width: "60%",
                  background:
                    "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover, var(--color-primary)))",
                }}
              />
            </div>
          )}

          {/* Error message */}
          {importProgress.phase === "error" && importProgress.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{importProgress.error}</p>
            </div>
          )}

          {/* Log list */}
          {importProgress.logs.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg bg-black/5 dark:bg-white/5 p-3 border border-black/5 dark:border-white/5">
              <div className="flex flex-col gap-1">
                {importProgress.logs.map((log, i) => (
                  <p
                    key={i}
                    className={`text-xs font-mono ${
                      log.startsWith("✓") ? "text-green-500 font-semibold" : "text-text-muted"
                    }`}
                  >
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Close button */}
          {importProgress.phase === "done" && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:opacity-90 transition-opacity"
              >
                {t("close") || "Close"}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ModelRow({
  model,
  fullModel,
  copied,
  onCopy,
  t,
  showDeveloperToggle = true,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecord,
  saveModelCompatFlags,
  compatDisabled,
  testStatus,
  onTest,
  isTesting,
}: ModelRowProps) {
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-border";
  const statusIcon =
    testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy";
  const statusColor =
    testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col gap-2 rounded-xl border bg-surface/50 px-3 py-3 shadow-sm transition-colors duration-200 hover:bg-sidebar/40",
        borderColor
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className="material-symbols-outlined mt-0.5 shrink-0 text-lg"
            style={statusColor ? { color: statusColor } : { color: "var(--color-text-muted)" }}
          >
            {statusIcon}
          </span>
          <code className="min-w-0 break-all rounded-md bg-sidebar/80 px-2 py-1.5 font-mono text-[11px] leading-snug text-text-main sm:text-xs">
            {fullModel}
          </code>
        </div>
        <div className="shrink-0 pt-0.5">
          <ModelCompatPopover
            t={t}
            effectiveModelNormalize={(p) => effectiveModelNormalize(model.id, p)}
            effectiveModelPreserveDeveloper={(p) => effectiveModelPreserveDeveloper(model.id, p)}
            getUpstreamHeadersRecord={getUpstreamHeadersRecord}
            onCompatPatch={(protocol, payload) =>
              saveModelCompatFlags(model.id, { compatByProtocol: { [protocol]: payload } })
            }
            showDeveloperToggle={showDeveloperToggle}
            disabled={compatDisabled}
          />
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border/50 pt-2">
        {onTest && (
          <button
            type="button"
            onClick={onTest}
            disabled={isTesting}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-sidebar hover:text-primary disabled:opacity-50",
              isTesting && "text-primary"
            )}
            title={isTesting ? t("testingModel") : t("testModel")}
            aria-label={isTesting ? t("testingModel") : t("testModel")}
          >
            <span
              className={`material-symbols-outlined text-base ${isTesting ? "animate-spin" : ""}`}
            >
              {isTesting ? "progress_activity" : "science"}
            </span>
            <span className="hidden sm:inline">
              {isTesting ? t("testingModel") : t("testModel")}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onCopy(fullModel, `model-${model.id}`)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-sidebar hover:text-primary"
          title={t("copyModel")}
        >
          <span className="material-symbols-outlined text-base">
            {copied === `model-${model.id}` ? "check" : "content_copy"}
          </span>
          <span className="hidden sm:inline">{t("copyModel")}</span>
        </button>
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  t: PropTypes.func,
  showDeveloperToggle: PropTypes.bool,
  effectiveModelNormalize: PropTypes.func.isRequired,
  effectiveModelPreserveDeveloper: PropTypes.func.isRequired,
  getUpstreamHeadersRecord: PropTypes.func.isRequired,
  saveModelCompatFlags: PropTypes.func.isRequired,
  compatDisabled: PropTypes.bool,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
};

function PassthroughModelsSection({
  providerAlias,
  modelAliases,
  copied,
  onCopy,
  onSetAlias,
  onDeleteAlias,
  t,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecord,
  saveModelCompatFlags,
  compatSavingModelId,
  modelTestResults = {},
  testingModelKey = null,
  onTestModel,
  canTestModels = false,
}: PassthroughModelsSectionProps) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);

  const providerAliases = Object.entries(modelAliases).filter(([, model]: [string, any]) =>
    (model as string).startsWith(`${providerAlias}/`)
  );

  const allModels = providerAliases.map(([alias, fullModel]: [string, any]) => {
    const fmStr = fullModel as string;
    const prefix = `${providerAlias}/`;
    return {
      modelId: fmStr.startsWith(prefix) ? fmStr.slice(prefix.length) : fmStr,
      fullModel,
      alias,
    };
  });

  // Generate default alias from modelId (last part after /)
  const generateDefaultAlias = (modelId) => {
    const parts = modelId.split("/");
    return parts[parts.length - 1];
  };

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    const defaultAlias = generateDefaultAlias(modelId);

    // Check if alias already exists
    if (modelAliases[defaultAlias]) {
      alert(t("aliasExistsAlert", { alias: defaultAlias }));
      return;
    }

    setAdding(true);
    try {
      await onSetAlias(modelId, defaultAlias);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{t("openRouterAnyModelHint")}</p>

      {/* Add new model */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="new-model-input" className="text-xs text-text-muted mb-1 block">
            {t("modelIdFromOpenRouter")}
          </label>
          <input
            id="new-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t("openRouterModelPlaceholder")}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? t("adding") : t("add")}
        </Button>
      </div>

      {/* Models list */}
      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ modelId, fullModel, alias }) => {
            const fm = fullModel as string;
            return (
              <PassthroughModelRow
                key={fm}
                modelId={modelId}
                fullModel={fm}
                copied={copied}
                onCopy={onCopy}
                onDeleteAlias={() => onDeleteAlias(alias)}
                t={t}
                showDeveloperToggle
                effectiveModelNormalize={effectiveModelNormalize}
                effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
                getUpstreamHeadersRecord={(p) => getUpstreamHeadersRecord(modelId, p)}
                saveModelCompatFlags={saveModelCompatFlags}
                compatDisabled={compatSavingModelId === modelId}
                testStatus={modelTestResults[fm]}
                onTest={canTestModels && onTestModel ? () => onTestModel(fm) : undefined}
                isTesting={testingModelKey === fm}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

PassthroughModelsSection.propTypes = {
  providerAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  effectiveModelNormalize: PropTypes.func.isRequired,
  effectiveModelPreserveDeveloper: PropTypes.func.isRequired,
  getUpstreamHeadersRecord: PropTypes.func.isRequired,
  saveModelCompatFlags: PropTypes.func.isRequired,
  compatSavingModelId: PropTypes.string,
  modelTestResults: PropTypes.object,
  testingModelKey: PropTypes.string,
  onTestModel: PropTypes.func,
  canTestModels: PropTypes.bool,
};

function PassthroughModelRow({
  modelId,
  fullModel,
  copied,
  onCopy,
  onDeleteAlias,
  t,
  showDeveloperToggle = true,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecord,
  saveModelCompatFlags,
  compatDisabled,
  testStatus,
  onTest,
  isTesting,
}: PassthroughModelRowProps) {
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-border";
  const statusIcon =
    testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy";
  const statusColor =
    testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col gap-2 rounded-xl border bg-surface/50 p-3 shadow-sm transition-colors hover:bg-sidebar/40",
        borderColor
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className="material-symbols-outlined mt-0.5 shrink-0 text-lg"
            style={statusColor ? { color: statusColor } : { color: "var(--color-text-muted)" }}
          >
            {statusIcon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-text-main">{modelId}</p>
            <code className="mt-1 block break-all rounded-md bg-sidebar/80 px-2 py-1.5 font-mono text-[11px] leading-snug text-text-muted sm:text-xs">
              {fullModel}
            </code>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          <ModelCompatPopover
            t={t}
            effectiveModelNormalize={(p) => effectiveModelNormalize(modelId, p)}
            effectiveModelPreserveDeveloper={(p) => effectiveModelPreserveDeveloper(modelId, p)}
            getUpstreamHeadersRecord={getUpstreamHeadersRecord}
            onCompatPatch={(protocol, payload) =>
              saveModelCompatFlags(modelId, { compatByProtocol: { [protocol]: payload } })
            }
            showDeveloperToggle={showDeveloperToggle}
            disabled={compatDisabled}
          />
          <button
            type="button"
            onClick={onDeleteAlias}
            className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10"
            title={t("removeModel")}
          >
            <span className="material-symbols-outlined text-lg">delete</span>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border/50 pt-2">
        {onTest && (
          <button
            type="button"
            onClick={onTest}
            disabled={isTesting}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-sidebar hover:text-primary disabled:opacity-50",
              isTesting && "text-primary"
            )}
            title={isTesting ? t("testingModel") : t("testModel")}
            aria-label={isTesting ? t("testingModel") : t("testModel")}
          >
            <span
              className={`material-symbols-outlined text-base ${isTesting ? "animate-spin" : ""}`}
            >
              {isTesting ? "progress_activity" : "science"}
            </span>
            <span className="hidden sm:inline">
              {isTesting ? t("testingModel") : t("testModel")}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onCopy(fullModel, `model-${modelId}`)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-sidebar hover:text-primary"
          title={t("copyModel")}
        >
          <span className="material-symbols-outlined text-base">
            {copied === `model-${modelId}` ? "check" : "content_copy"}
          </span>
          <span className="hidden sm:inline">{t("copyModel")}</span>
        </button>
      </div>
    </div>
  );
}

PassthroughModelRow.propTypes = {
  modelId: PropTypes.string.isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  t: PropTypes.func,
  showDeveloperToggle: PropTypes.bool,
  effectiveModelNormalize: PropTypes.func.isRequired,
  effectiveModelPreserveDeveloper: PropTypes.func.isRequired,
  getUpstreamHeadersRecord: PropTypes.func.isRequired,
  saveModelCompatFlags: PropTypes.func.isRequired,
  compatDisabled: PropTypes.bool,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
};

// ============ Custom Models Section (for ALL providers) ============

function CustomModelsSection({
  providerId,
  providerAlias,
  copied,
  onCopy,
  onModelsChanged,
  onTestModel,
  modelTestResults = {},
  testingModelKey = null,
  canTestModels = false,
}: CustomModelsSectionProps) {
  const t = useTranslations("providers");
  const notify = useNotificationStore();
  const [customModels, setCustomModels] = useState<CompatModelRow[]>([]);
  const [modelCompatOverrides, setModelCompatOverrides] = useState<
    Array<CompatModelRow & { id: string }>
  >([]);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newApiFormat, setNewApiFormat] = useState("chat-completions");
  const [newEndpoints, setNewEndpoints] = useState(["chat"]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingApiFormat, setEditingApiFormat] = useState("chat-completions");
  const [editingEndpoints, setEditingEndpoints] = useState<string[]>(["chat"]);
  const [savingModelId, setSavingModelId] = useState<string | null>(null);

  const customMap = useMemo(() => buildCompatMap(customModels), [customModels]);
  const overrideMap = useMemo(() => buildCompatMap(modelCompatOverrides), [modelCompatOverrides]);

  const endpointOptionMeta: Record<string, { icon: string; label: string }> = {
    chat: { icon: "chat", label: "Chat" },
    embeddings: { icon: "data_array", label: "Embeddings" },
    images: { icon: "image", label: "Images" },
    audio: { icon: "graphic_eq", label: "Audio" },
  };

  const pendingAddFullModel = newModelId.trim() ? `${providerAlias}/${newModelId.trim()}` : "";

  const fetchCustomModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/provider-models?provider=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomModels(data.models || []);
        setModelCompatOverrides(data.modelCompatOverrides || []);
      }
    } catch (e) {
      console.error("Failed to fetch custom models:", e);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchCustomModels();
  }, [fetchCustomModels]);

  const handleAdd = async () => {
    if (!newModelId.trim() || adding) return;
    const modelIdTrim = newModelId.trim();
    const fullModelForProbe = `${providerAlias}/${modelIdTrim}`;
    setAdding(true);
    try {
      if (newEndpoints.includes("chat")) {
        if (!canTestModels || !onTestModel) {
          notify.error(t("addConnectionToImport"));
          return;
        }
        const probeOk = await onTestModel(fullModelForProbe);
        if (!probeOk) return;
      }
      const res = await fetch("/api/provider-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          modelId: modelIdTrim,
          modelName: newModelName.trim() || undefined,
          apiFormat: newApiFormat,
          supportedEndpoints: newEndpoints,
        }),
      });
      if (res.ok) {
        await fetchCustomModels();
        onModelsChanged?.();
        notify.success(t("modelAddedSuccess", { modelId: modelIdTrim }));
        setNewModelId("");
        setNewModelName("");
        setNewApiFormat("chat-completions");
        setNewEndpoints(["chat"]);
      } else {
        const detail = await formatProviderModelsErrorResponse(res);
        notify.error(detail || t("failedAddModelTryAgain"));
      }
    } catch (e) {
      console.error("Failed to add custom model:", e);
      notify.error(t("failedAddModelTryAgain"));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (modelId) => {
    try {
      await fetch(
        `/api/provider-models?provider=${encodeURIComponent(providerId)}&model=${encodeURIComponent(modelId)}`,
        {
          method: "DELETE",
        }
      );
      await fetchCustomModels();
      onModelsChanged?.();
    } catch (e) {
      console.error("Failed to remove custom model:", e);
    }
  };

  const beginEdit = (model) => {
    setEditingModelId(model.id);
    setEditingApiFormat(model.apiFormat || "chat-completions");
    setEditingEndpoints(
      Array.isArray(model.supportedEndpoints) && model.supportedEndpoints.length
        ? model.supportedEndpoints
        : ["chat"]
    );
  };

  const cancelEdit = () => {
    setEditingModelId(null);
    setEditingApiFormat("chat-completions");
    setEditingEndpoints(["chat"]);
    setSavingModelId(null);
  };

  const saveCustomCompat = async (
    modelId: string,
    patch: { compatByProtocol?: CompatByProtocolMap }
  ) => {
    setSavingModelId(modelId);
    try {
      const res = await fetch("/api/provider-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, modelId, ...patch }),
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
      setSavingModelId(null);
    }
    try {
      await fetchCustomModels();
      onModelsChanged?.();
    } catch {
      /* refresh failure is non-critical — data was already saved */
    }
  };

  const saveEdit = async (modelId) => {
    if (!editingModelId || editingModelId !== modelId) return;
    if (!editingEndpoints.length) {
      notify.error("Select at least one supported endpoint");
      return;
    }

    setSavingModelId(modelId);
    try {
      const model = customModels.find((m) => m.id === modelId);
      const res = await fetch("/api/provider-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          modelId,
          modelName: model?.name || modelId,
          source: model?.source || "manual",
          apiFormat: editingApiFormat,
          supportedEndpoints: editingEndpoints,
        }),
      });

      if (!res.ok) {
        const detail = await formatProviderModelsErrorResponse(res);
        throw new Error(detail || "Failed to save model endpoint settings");
      }

      await fetchCustomModels();
      onModelsChanged?.();
      notify.success("Saved model endpoint settings");
      cancelEdit();
    } catch (e) {
      console.error("Failed to save custom model:", e);
      notify.error(
        e instanceof Error && e.message ? e.message : "Failed to save model endpoint settings"
      );
    } finally {
      setSavingModelId(null);
    }
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="material-symbols-outlined text-xl text-primary" aria-hidden>
            tune
          </span>
          {t("customModels")}
        </h3>
        <p className="mt-1 text-sm text-text-muted">{t("customModelsHint")}</p>
      </div>

      {/* Add form — single card; Add applies to all fields */}
      <div className="mb-5 rounded-xl border border-border/60 bg-bg-subtle/30 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <div className="min-w-0">
              <label
                htmlFor="custom-model-id"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                {t("modelId")}
              </label>
              <input
                id="custom-model-id"
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder={t("customModelPlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="custom-model-name"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                {t("displayName")}
              </label>
              <input
                id="custom-model-name"
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder={t("optional")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/50 bg-background/50 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              API &amp; routing
            </p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,13rem)_1fr] lg:items-start">
              <div className="min-w-0">
                <label
                  htmlFor="custom-api-format"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  API Format
                </label>
                <select
                  id="custom-api-format"
                  value={newApiFormat}
                  onChange={(e) => setNewApiFormat(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="chat-completions">Chat Completions</option>
                  <option value="responses">Responses API</option>
                </select>
              </div>
              <div className="min-w-0">
                <span className="mb-2 block text-xs font-medium text-text-muted">
                  Supported Endpoints
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["chat", "embeddings", "images", "audio"].map((ep) => {
                    const meta = endpointOptionMeta[ep];
                    const checked = newEndpoints.includes(ep);
                    return (
                      <label
                        key={ep}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                          checked
                            ? "border-primary/35 bg-primary/10"
                            : "border-border/60 bg-background/80 hover:border-border"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewEndpoints((prev) => [...prev, ep]);
                            } else {
                              setNewEndpoints((prev) => prev.filter((x) => x !== ep));
                            }
                          }}
                          className="rounded border-border"
                        />
                        <span
                          className="material-symbols-outlined text-base text-text-muted"
                          aria-hidden
                        >
                          {meta.icon}
                        </span>
                        <span className="text-xs font-medium text-text-main">{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-border/40 pt-4">
            <Button
              size="sm"
              icon="add"
              onClick={handleAdd}
              disabled={!newModelId.trim() || adding}
              className="w-full min-w-[10rem] sm:w-auto"
            >
              {adding && testingModelKey === pendingAddFullModel
                ? t("testingModel")
                : adding
                  ? t("adding")
                  : t("add")}
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-text-muted">{t("loading")}</p>
      ) : customModels.length > 0 ? (
        <div className="flex flex-col gap-2">
          {customModels.map((model) => {
            const fullModel = `${providerAlias}/${model.id}`;
            const copyKey = `custom-${model.id}`;
            return (
              <div
                key={model.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-sidebar/50",
                  modelTestResults[fullModel] === "ok" && "border-green-500/35",
                  modelTestResults[fullModel] === "error" && "border-red-500/30",
                  !modelTestResults[fullModel] && "border-border"
                )}
              >
                {editingModelId !== model.id && (
                  <span className="material-symbols-outlined shrink-0 text-base text-primary">
                    tune
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{model.name || model.id}</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">
                      {fullModel}
                    </code>
                    <button
                      onClick={() => onCopy(fullModel, copyKey)}
                      className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
                      title={t("copyModel")}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copied === copyKey ? "check" : "content_copy"}
                      </span>
                    </button>
                    {model.apiFormat === "responses" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">
                        Responses
                      </span>
                    )}
                    {model.supportedEndpoints?.includes("embeddings") && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">
                        📐 Embed
                      </span>
                    )}
                    {model.supportedEndpoints?.includes("images") && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                        🖼️ Images
                      </span>
                    )}
                    {model.supportedEndpoints?.includes("audio") && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
                        🔊 Audio
                      </span>
                    )}
                    {anyNormalizeCompatBadge(model.id, customMap, overrideMap) && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 font-medium"
                        title={t("normalizeToolCallIdLabel")}
                      >
                        ID×9
                      </span>
                    )}
                    {anyNoPreserveCompatBadge(model.id, customMap, overrideMap) && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium"
                        title={t("compatDoNotPreserveDeveloper")}
                      >
                        {t("compatBadgeNoPreserve")}
                      </span>
                    )}
                    {anyUpstreamHeadersBadge(model.id, customMap, overrideMap) && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium"
                        title={t("compatUpstreamHeadersLabel")}
                      >
                        {t("compatBadgeUpstreamHeaders")}
                      </span>
                    )}
                  </div>

                  {editingModelId === model.id && (
                    <div className="mt-3 min-w-0 max-w-full rounded-lg border border-border/60 bg-muted/50 p-4 dark:bg-zinc-900/80">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        API &amp; routing
                      </p>
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,13rem)_1fr] lg:items-start">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-text-muted">
                            API Format
                          </label>
                          <select
                            value={editingApiFormat}
                            onChange={(e) => setEditingApiFormat(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
                          >
                            <option value="chat-completions">Chat Completions</option>
                            <option value="responses">Responses API</option>
                          </select>
                        </div>
                        <div className="min-w-0">
                          <span className="mb-2 block text-xs font-medium text-text-muted">
                            Supported Endpoints
                          </span>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {["chat", "embeddings", "images", "audio"].map((ep) => {
                              const meta = endpointOptionMeta[ep];
                              const checked = editingEndpoints.includes(ep);
                              return (
                                <label
                                  key={ep}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                                    checked
                                      ? "border-primary/35 bg-primary/10"
                                      : "border-border/60 bg-background/80 hover:border-border"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setEditingEndpoints((prev) =>
                                          prev.includes(ep) ? prev : [...prev, ep]
                                        );
                                      } else {
                                        setEditingEndpoints((prev) => prev.filter((x) => x !== ep));
                                      }
                                    }}
                                    className="rounded border-border"
                                  />
                                  <span
                                    className="material-symbols-outlined text-base text-text-muted"
                                    aria-hidden
                                  >
                                    {meta.icon}
                                  </span>
                                  <span className="text-xs font-medium text-text-main">
                                    {meta.label}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/40 pt-3">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(model.id)}
                          disabled={savingModelId === model.id}
                        >
                          {savingModelId === model.id ? t("saving") : t("save")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          {t("cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-0.5">
                  {canTestModels && onTestModel && (
                    <button
                      type="button"
                      onClick={() => void onTestModel(fullModel)}
                      disabled={testingModelKey === fullModel}
                      className={cn(
                        "rounded-md p-1.5 text-text-muted transition-colors hover:bg-sidebar hover:text-primary",
                        modelTestResults[fullModel] === "ok" &&
                          "text-green-500 hover:text-green-400",
                        modelTestResults[fullModel] === "error" && "text-red-500 hover:text-red-400"
                      )}
                      title={testingModelKey === fullModel ? t("testingModel") : t("testModel")}
                      aria-label={
                        testingModelKey === fullModel ? t("testingModel") : t("testModel")
                      }
                    >
                      <span
                        className={cn(
                          "material-symbols-outlined text-lg",
                          testingModelKey === fullModel && "animate-spin"
                        )}
                      >
                        {testingModelKey === fullModel ? "progress_activity" : "science"}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => beginEdit(model)}
                    className="rounded-md p-1.5 text-text-muted hover:bg-sidebar hover:text-primary"
                    title={t("edit")}
                  >
                    <span className="material-symbols-outlined text-lg">edit</span>
                  </button>
                  <ModelCompatPopover
                    t={t}
                    effectiveModelNormalize={(p) =>
                      effectiveNormalizeForProtocol(model.id, p, customMap, overrideMap)
                    }
                    effectiveModelPreserveDeveloper={(p) =>
                      effectivePreserveForProtocol(model.id, p, customMap, overrideMap)
                    }
                    getUpstreamHeadersRecord={(p) =>
                      effectiveUpstreamHeadersForProtocol(model.id, p, customMap, overrideMap)
                    }
                    onCompatPatch={(protocol, payload) =>
                      saveCustomCompat(model.id, {
                        compatByProtocol: { [protocol]: payload },
                      })
                    }
                    showDeveloperToggle
                    disabled={savingModelId === model.id}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(model.id)}
                    className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10"
                    title={t("removeCustomModel")}
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-bg-subtle/20 py-10 text-center">
          <span
            className="material-symbols-outlined mb-2 inline-block text-3xl text-text-muted/50"
            aria-hidden
          >
            deployed_code
          </span>
          <p className="text-sm text-text-muted">{t("noCustomModels")}</p>
        </div>
      )}
    </div>
  );
}

CustomModelsSection.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerAlias: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onModelsChanged: PropTypes.func,
  onTestModel: PropTypes.func,
  modelTestResults: PropTypes.object,
  testingModelKey: PropTypes.string,
  canTestModels: PropTypes.bool,
};

function CompatibleModelsSection({
  providerStorageAlias,
  providerDisplayAlias,
  modelAliases,
  fallbackModels = [],
  description,
  inputLabel,
  inputPlaceholder,
  copied,
  onCopy,
  onSetAlias,
  onDeleteAlias,
  connections,
  isAnthropic,
  onImportWithProgress,
  t,
  effectiveModelNormalize,
  effectiveModelPreserveDeveloper,
  getUpstreamHeadersRecord,
  saveModelCompatFlags,
  compatSavingModelId,
  onModelsChanged,
  allowImport,
  modelTestResults = {},
  testingModelKey = null,
  onTestModel,
  canTestModels = false,
}: CompatibleModelsSectionProps) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const notify = useNotificationStore();

  const providerAliases = useMemo(
    () =>
      Object.entries(modelAliases).filter(([, model]: [string, any]) =>
        (model as string).startsWith(`${providerStorageAlias}/`)
      ),
    [modelAliases, providerStorageAlias]
  );

  const allModels = useMemo(() => {
    const rows = providerAliases.map(([alias, fullModel]: [string, any]) => {
      const fmStr = fullModel as string;
      const prefix = `${providerStorageAlias}/`;
      return {
        modelId: fmStr.startsWith(prefix) ? fmStr.slice(prefix.length) : fmStr,
        alias,
      };
    });

    const seenModelIds = new Set(rows.map((row) => row.modelId));
    for (const model of fallbackModels) {
      if (!model?.id || seenModelIds.has(model.id)) continue;
      rows.push({ modelId: model.id, alias: null });
      seenModelIds.add(model.id);
    }

    return rows;
  }, [fallbackModels, providerAliases, providerStorageAlias]);

  const resolveAlias = useCallback(
    (modelId: string, workingAliases: Record<string, string>) =>
      resolveManagedModelAlias({
        modelId,
        fullModel: `${providerStorageAlias}/${modelId}`,
        providerDisplayAlias,
        existingAliases: workingAliases,
      }),
    [providerDisplayAlias, providerStorageAlias]
  );

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    const resolvedAlias = resolveAlias(modelId, modelAliases);
    if (!resolvedAlias) {
      notify.error(t("allSuggestedAliasesExist"));
      return;
    }

    setAdding(true);
    try {
      // Save to customModels DB FIRST - only create alias if this succeeds
      const customModelRes = await fetch("/api/provider-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerStorageAlias,
          modelId,
          modelName: modelId,
          source: "manual",
        }),
      });

      if (!customModelRes.ok) {
        let errorData: { error?: { message?: string } } = {};
        try {
          errorData = await customModelRes.json();
        } catch (jsonError) {
          console.error("Failed to parse error response from custom model API:", jsonError);
        }
        throw new Error(errorData.error?.message || t("failedSaveCustomModel"));
      }

      // Only create alias after customModel is saved successfully
      await onSetAlias(modelId, resolvedAlias, providerStorageAlias);
      setNewModel("");
      notify.success(t("modelAddedSuccess", { modelId }));
      onModelsChanged?.();
    } catch (error) {
      console.error("Error adding model:", error);
      notify.error(error instanceof Error ? error.message : t("failedAddModelTryAgain"));
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (!allowImport || importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const workingAliases = { ...modelAliases };
      await onImportWithProgress(
        // fetchModels callback
        async () => {
          const res = await fetch(`/api/providers/${activeConnection.id}/models`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || t("failedImportModels"));
          return data;
        },
        // processModel callback
        async (model: any) => {
          const modelId = model.id || model.name || model.model;
          if (!modelId) return false;
          const resolvedAlias = resolveAlias(modelId, workingAliases);
          if (!resolvedAlias) return false;

          // Save to customModels DB FIRST - only create alias if this succeeds
          const customModelRes = await fetch("/api/provider-models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: providerStorageAlias,
              modelId,
              modelName: model.name || modelId,
              source: "imported",
            }),
          });

          if (!customModelRes.ok) {
            notify.error(t("failedSaveImportedModel"));
            return false;
          }

          // Only create alias after customModel is saved successfully
          await onSetAlias(modelId, resolvedAlias, providerStorageAlias);
          workingAliases[resolvedAlias] = `${providerStorageAlias}/${modelId}`;
          return true;
        }
      );
    } catch (error) {
      console.error("Error importing models:", error);
      notify.error(t("failedImportModelsTryAgain"));
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  // Handle delete: remove from both alias and customModels DB
  const handleDeleteModel = async (modelId: string, alias?: string | null) => {
    try {
      // Remove from customModels DB
      const res = await fetch(
        `/api/provider-models?provider=${encodeURIComponent(providerStorageAlias)}&model=${encodeURIComponent(modelId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error(t("failedRemoveModelFromDatabase"));
      }
      // Also delete the alias
      if (alias) {
        await onDeleteAlias(alias);
      }
      notify.success(t("modelRemovedSuccess"));
      onModelsChanged?.();
    } catch (error) {
      console.error("Error deleting model:", error);
      notify.error(error instanceof Error ? error.message : t("failedDeleteModelTryAgain"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{description}</p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label
            htmlFor="new-compatible-model-input"
            className="text-xs text-text-muted mb-1 block"
          >
            {inputLabel}
          </label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={inputPlaceholder}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? t("adding") : t("add")}
        </Button>
        {allowImport && (
          <Button
            size="sm"
            variant="secondary"
            icon="download"
            onClick={handleImport}
            disabled={!canImport || importing}
          >
            {importing ? t("importingModels") : t("importFromModels")}
          </Button>
        )}
      </div>

      {allowImport && !canImport && (
        <p className="text-xs text-text-muted">{t("addConnectionToImport")}</p>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ modelId, alias }) => {
            const fullModel = `${providerDisplayAlias}/${modelId}`;
            return (
              <PassthroughModelRow
                key={`${providerStorageAlias}:${modelId}`}
                modelId={modelId}
                fullModel={fullModel}
                copied={copied}
                onCopy={onCopy}
                onDeleteAlias={() => handleDeleteModel(modelId, alias)}
                t={t}
                showDeveloperToggle={!isAnthropic}
                effectiveModelNormalize={effectiveModelNormalize}
                effectiveModelPreserveDeveloper={effectiveModelPreserveDeveloper}
                getUpstreamHeadersRecord={(p) => getUpstreamHeadersRecord(modelId, p)}
                saveModelCompatFlags={saveModelCompatFlags}
                compatDisabled={compatSavingModelId === modelId}
                testStatus={modelTestResults[fullModel]}
                onTest={canTestModels && onTestModel ? () => onTestModel(fullModel) : undefined}
                isTesting={testingModelKey === fullModel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  fallbackModels: PropTypes.array,
  description: PropTypes.string.isRequired,
  inputLabel: PropTypes.string.isRequired,
  inputPlaceholder: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ).isRequired,
  isAnthropic: PropTypes.bool,
  onImportWithProgress: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  effectiveModelNormalize: PropTypes.func.isRequired,
  effectiveModelPreserveDeveloper: PropTypes.func.isRequired,
  getUpstreamHeadersRecord: PropTypes.func.isRequired,
  saveModelCompatFlags: PropTypes.func.isRequired,
  compatSavingModelId: PropTypes.string,
  onModelsChanged: PropTypes.func,
  allowImport: PropTypes.bool.isRequired,
  modelTestResults: PropTypes.object,
  testingModelKey: PropTypes.string,
  onTestModel: PropTypes.func,
  canTestModels: PropTypes.bool,
};

function CooldownTimer({ until }: CooldownTimerProps) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const updateRemaining = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("");
        return;
      }
      const secs = Math.floor(diff / 1000);
      if (secs < 60) {
        setRemaining(`${secs}s`);
      } else if (secs < 3600) {
        setRemaining(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      } else {
        const hrs = Math.floor(secs / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        setRemaining(`${hrs}h ${mins}m`);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!remaining) return null;

  return <span className="text-xs text-orange-500 font-mono">⏱ {remaining}</span>;
}

CooldownTimer.propTypes = {
  until: PropTypes.string.isRequired,
};

const ERROR_TYPE_LABELS = {
  runtime_error: { labelKey: "errorTypeRuntime", variant: "warning" },
  upstream_auth_error: { labelKey: "errorTypeUpstreamAuth", variant: "error" },
  account_deactivated: { labelKey: "errorTypeAccountDeactivated", variant: "error" },
  auth_missing: { labelKey: "errorTypeMissingCredential", variant: "warning" },
  token_refresh_failed: { labelKey: "errorTypeRefreshFailed", variant: "warning" },
  token_expired: { labelKey: "errorTypeTokenExpired", variant: "warning" },
  upstream_rate_limited: { labelKey: "errorTypeRateLimited", variant: "warning" },
  upstream_unavailable: { labelKey: "errorTypeUpstreamUnavailable", variant: "error" },
  network_error: { labelKey: "errorTypeNetworkError", variant: "warning" },
  unsupported: { labelKey: "errorTypeTestUnsupported", variant: "default" },
  upstream_error: { labelKey: "errorTypeUpstreamError", variant: "error" },
  banned: { labelKey: "errorTypeBanned", variant: "error" },
  credits_exhausted: { labelKey: "errorTypeCreditsExhausted", variant: "warning" },
};

function inferErrorType(connection, isCooldown) {
  if (isCooldown) return "upstream_rate_limited";
  if (connection.testStatus === "banned") return "banned";
  if (connection.testStatus === "credits_exhausted") return "credits_exhausted";
  if (connection.lastErrorType) return connection.lastErrorType;

  const code = Number(connection.errorCode);
  if (code === 401 || code === 403) return "upstream_auth_error";
  if (code === 429) return "upstream_rate_limited";
  if (code >= 500) return "upstream_unavailable";

  const msg = (connection.lastError || "").toLowerCase();
  if (!msg) return null;
  if (
    msg.includes("runtime") ||
    msg.includes("not runnable") ||
    msg.includes("not installed") ||
    msg.includes("healthcheck")
  )
    return "runtime_error";
  if (msg.includes("refresh failed")) return "token_refresh_failed";
  if (msg.includes("token expired") || msg.includes("expired")) return "token_expired";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("access denied") ||
    msg.includes("unauthorized")
  )
    return "upstream_auth_error";
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  )
    return "upstream_rate_limited";
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econn") ||
    msg.includes("enotfound")
  )
    return "network_error";
  if (msg.includes("not supported")) return "unsupported";
  return "upstream_error";
}

function getStatusPresentation(connection, effectiveStatus, isCooldown, t) {
  if (connection.isActive === false) {
    return {
      statusVariant: "default",
      statusLabel: t("statusDisabled"),
      errorType: null,
      errorBadge: null,
      errorTextClass: "text-text-muted",
    };
  }

  if (effectiveStatus === "active" || effectiveStatus === "success") {
    return {
      statusVariant: "success",
      statusLabel: t("statusConnected"),
      errorType: null,
      errorBadge: null,
      errorTextClass: "text-text-muted",
    };
  }

  const errorType = inferErrorType(connection, isCooldown);
  const errorBadge = errorType ? ERROR_TYPE_LABELS[errorType] || null : null;

  if (errorType === "runtime_error") {
    return {
      statusVariant: "warning",
      statusLabel: t("statusRuntimeIssue"),
      errorType,
      errorBadge,
      errorTextClass: "text-yellow-600 dark:text-yellow-400",
    };
  }

  if (errorType === "account_deactivated") {
    return {
      statusVariant: "error",
      statusLabel: t("statusDeactivated", "Deactivated"),
      errorType,
      errorBadge,
      errorTextClass: "text-red-600 font-bold",
    };
  }

  if (
    errorType === "upstream_auth_error" ||
    errorType === "auth_missing" ||
    errorType === "token_refresh_failed" ||
    errorType === "token_expired"
  ) {
    return {
      statusVariant: "error",
      statusLabel: t("statusAuthFailed"),
      errorType,
      errorBadge,
      errorTextClass: "text-red-500",
    };
  }

  if (errorType === "upstream_rate_limited") {
    return {
      statusVariant: "warning",
      statusLabel: t("statusRateLimited"),
      errorType,
      errorBadge,
      errorTextClass: "text-yellow-600 dark:text-yellow-400",
    };
  }

  if (errorType === "network_error") {
    return {
      statusVariant: "warning",
      statusLabel: t("statusNetworkIssue"),
      errorType,
      errorBadge,
      errorTextClass: "text-yellow-600 dark:text-yellow-400",
    };
  }

  if (errorType === "unsupported") {
    return {
      statusVariant: "default",
      statusLabel: t("statusTestUnsupported"),
      errorType,
      errorBadge,
      errorTextClass: "text-text-muted",
    };
  }

  if (errorType === "banned") {
    return {
      statusVariant: "error",
      statusLabel: t("statusBanned", "Banned (403)"),
      errorType,
      errorBadge,
      errorTextClass: "text-red-600 font-bold",
    };
  }

  if (errorType === "credits_exhausted") {
    return {
      statusVariant: "warning",
      statusLabel: t("statusCreditsExhausted", "Out of Credits"),
      errorType,
      errorBadge,
      errorTextClass: "text-amber-500",
    };
  }

  const fallbackStatusMap = {
    unavailable: t("statusUnavailable"),
    failed: t("statusFailed"),
    error: t("statusError"),
  };

  return {
    statusVariant: "error",
    statusLabel: fallbackStatusMap[effectiveStatus] || effectiveStatus || t("statusError"),
    errorType,
    errorBadge,
    errorTextClass: "text-red-500",
  };
}

function ConnectionRow({
  connection,
  isOAuth,
  isCodex,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onToggleRateLimit,
  onToggleCodex5h,
  onToggleCodexWeekly,
  onRetest,
  isRetesting,
  onEdit,
  onDelete,
  onReauth,
  onProxy,
  hasProxy,
  proxySource,
  proxyHost,
  onRefreshToken,
  isRefreshing,
  onApplyCodexAuthLocal,
  isApplyingCodexAuthLocal,
  onExportCodexAuthFile,
  isExportingCodexAuthFile,
  showBulkSelect,
  bulkSelected,
  onToggleBulkSelect,
}: ConnectionRowProps) {
  const t = useTranslations("providers");
  const displayName = isOAuth
    ? connection.name || connection.email || connection.displayName || t("oauthAccount")
    : connection.name;
  const applyCodexAuthLabel =
    typeof t.has === "function" && t.has("applyCodexAuthLocal")
      ? t("applyCodexAuthLocal")
      : "Apply auth";
  const exportCodexAuthLabel =
    typeof t.has === "function" && t.has("exportCodexAuthFile")
      ? t("exportCodexAuthFile")
      : "Export auth";

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState(false);
  // T12: token expiry status — lazy init avoids calling Date.now() during render;
  // updates every 30s via interval only (no sync setState in effect body).
  const getTokenMinsLeft = () => {
    if (!isOAuth || !connection.expiresAt) return null;
    const expiresMs = new Date(connection.expiresAt).getTime();
    return Math.floor((expiresMs - Date.now()) / 60000);
  };
  const [tokenMinsLeft, setTokenMinsLeft] = useState<number | null>(getTokenMinsLeft);

  useEffect(() => {
    if (!isOAuth || !connection.expiresAt) return;
    const update = () => {
      const expiresMs = new Date(connection.expiresAt).getTime();
      setTokenMinsLeft(Math.floor((expiresMs - Date.now()) / 60000));
    };
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [isOAuth, connection.expiresAt]);

  useEffect(() => {
    const checkCooldown = () => {
      const cooldown =
        connection.rateLimitedUntil && new Date(connection.rateLimitedUntil).getTime() > Date.now();
      setIsCooldown(cooldown);
    };

    checkCooldown();
    // Update every second while in cooldown
    const interval = connection.rateLimitedUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connection.rateLimitedUntil]);

  // Determine effective status (override unavailable if cooldown expired)
  const effectiveStatus =
    connection.testStatus === "unavailable" && !isCooldown
      ? "active" // Cooldown expired → treat as active
      : connection.testStatus;

  const statusPresentation = getStatusPresentation(connection, effectiveStatus, isCooldown, t);
  const rateLimitEnabled = !!connection.rateLimitProtection;
  const codexPolicy =
    connection.providerSpecificData &&
    typeof connection.providerSpecificData === "object" &&
    connection.providerSpecificData.codexLimitPolicy &&
    typeof connection.providerSpecificData.codexLimitPolicy === "object"
      ? connection.providerSpecificData.codexLimitPolicy
      : {};
  const normalizedCodexPolicy = normalizeCodexLimitPolicy(codexPolicy);
  const codex5hEnabled = normalizedCodexPolicy.use5h;
  const codexWeeklyEnabled = normalizedCodexPolicy.useWeekly;

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 px-2 py-4 transition-colors duration-200 sm:px-3",
        "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
        connection.isActive === false && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {showBulkSelect && onToggleBulkSelect && (
            <input
              type="checkbox"
              checked={!!bulkSelected}
              onChange={onToggleBulkSelect}
              className="mt-1 h-4 w-4 shrink-0 rounded border-border"
              aria-label={t("selectConnection")}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className={`rounded p-0.5 ${isFirst ? "cursor-not-allowed text-text-muted/30" : "text-text-muted hover:bg-sidebar hover:text-primary"}`}
            >
              <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className={`rounded p-0.5 ${isLast ? "cursor-not-allowed text-text-muted/30" : "text-text-muted hover:bg-sidebar hover:text-primary"}`}
            >
              <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
            </button>
          </div>
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-base text-text-muted">
            {isOAuth ? "lock" : "key"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-text-main">{displayName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusPresentation.statusVariant as any} size="sm" dot>
                {statusPresentation.statusLabel}
              </Badge>
              {tokenMinsLeft !== null &&
                (tokenMinsLeft < 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium bg-red-500/15 text-red-500"
                    title={`Token expired: ${connection.expiresAt}`}
                  >
                    <span className="material-symbols-outlined text-[11px]">error</span>
                    expired
                  </span>
                ) : tokenMinsLeft < 30 ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-500"
                    title={`Token expires in ${tokenMinsLeft}m`}
                  >
                    <span className="material-symbols-outlined text-[11px]">warning</span>
                    {`~${tokenMinsLeft}m`}
                  </span>
                ) : null)}
              {isCooldown && connection.isActive !== false && (
                <CooldownTimer until={connection.rateLimitedUntil} />
              )}
              {statusPresentation.errorBadge && connection.isActive !== false && (
                <Badge variant={statusPresentation.errorBadge.variant} size="sm">
                  {t(statusPresentation.errorBadge.labelKey)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 border border-border/40 bg-bg-subtle/35 p-1.5 sm:w-auto sm:justify-end lg:max-w-[min(100%,28rem)] lg:shrink-0 lg:rounded-lg">
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            loading={isRetesting}
            disabled={connection.isActive === false}
            onClick={onRetest}
            className="h-8 px-2 text-xs"
            title={t("retestAuthentication")}
          >
            {t("retest")}
          </Button>
          {onRefreshToken && (
            <Button
              size="sm"
              variant="ghost"
              icon="token"
              loading={isRefreshing}
              disabled={connection.isActive === false || isRefreshing}
              onClick={onRefreshToken}
              className="h-8 px-2 text-xs text-amber-500 hover:text-amber-400"
              title="Refresh OAuth token manually"
            >
              Token
            </Button>
          )}
          {isCodex && onApplyCodexAuthLocal && (
            <Button
              size="sm"
              variant="ghost"
              icon="download_done"
              loading={isApplyingCodexAuthLocal}
              disabled={isApplyingCodexAuthLocal}
              onClick={onApplyCodexAuthLocal}
              className="h-8 px-2 text-xs text-emerald-500 hover:text-emerald-400"
              title={applyCodexAuthLabel}
            >
              {applyCodexAuthLabel}
            </Button>
          )}
          {isCodex && onExportCodexAuthFile && (
            <Button
              size="sm"
              variant="ghost"
              icon="download"
              loading={isExportingCodexAuthFile}
              disabled={isExportingCodexAuthFile}
              onClick={onExportCodexAuthFile}
              className="h-8 px-2 text-xs text-sky-500 hover:text-sky-400"
              title={exportCodexAuthLabel}
            >
              {exportCodexAuthLabel}
            </Button>
          )}
          <div className="mx-0.5 flex items-center gap-1 border-l border-border/50 pl-2">
            <Toggle
              size="sm"
              checked={connection.isActive ?? true}
              onChange={onToggleActive}
              title={(connection.isActive ?? true) ? t("disableConnection") : t("enableConnection")}
            />
          </div>
          <div className="flex items-center gap-0.5">
            {onReauth && (
              <button
                type="button"
                onClick={onReauth}
                className="rounded p-1.5 text-amber-600 hover:bg-amber-500/10 hover:text-amber-500"
                title={t("reauthenticateConnection")}
              >
                <span className="material-symbols-outlined text-lg">passkey</span>
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1.5 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title={t("edit")}
            >
              <span className="material-symbols-outlined text-lg">edit</span>
            </button>
            <button
              type="button"
              onClick={onProxy}
              className="rounded p-1.5 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title={t("proxyConfig")}
            >
              <span className="material-symbols-outlined text-lg">vpn_lock</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1.5 text-red-500 hover:bg-red-500/10"
              title={t("delete")}
            >
              <span className="material-symbols-outlined text-lg">delete</span>
            </button>
          </div>
        </div>
      </div>

      {connection.lastError && connection.isActive !== false && (
        <p
          className={cn(
            "rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-xs leading-relaxed wrap-break-word",
            statusPresentation.errorTextClass
          )}
          title={connection.lastError.replace(/<[^>]+>/gm, "")}
        >
          {connection.lastError.replace(/<[^>]+>/gm, "")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-3 text-xs">
        <span className="tabular-nums text-text-muted">
          #{connection.priority}
          {connection.globalPriority
            ? ` · ${t("autoPriority", { priority: connection.globalPriority })}`
            : ""}
        </span>
        <button
          type="button"
          onClick={() => onToggleRateLimit(!rateLimitEnabled)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
            rateLimitEnabled
              ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
              : "bg-black/[0.03] text-text-muted/70 hover:bg-black/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          }`}
          title={
            rateLimitEnabled ? t("disableRateLimitProtection") : t("enableRateLimitProtection")
          }
        >
          <span className="material-symbols-outlined text-[14px]">shield</span>
          {rateLimitEnabled ? t("rateLimitProtected") : t("rateLimitUnprotected")}
        </button>
        {isCodex && (
          <>
            <button
              type="button"
              onClick={() => onToggleCodex5h?.(!codex5hEnabled)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                codex5hEnabled
                  ? "bg-blue-500/15 text-blue-500 hover:bg-blue-500/25"
                  : "bg-black/[0.03] text-text-muted/70 hover:bg-black/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
              title="Toggle Codex 5h limit policy"
            >
              <span className="material-symbols-outlined text-[14px]">timer</span>
              5h {codex5hEnabled ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onClick={() => onToggleCodexWeekly?.(!codexWeeklyEnabled)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                codexWeeklyEnabled
                  ? "bg-violet-500/15 text-violet-500 hover:bg-violet-500/25"
                  : "bg-black/[0.03] text-text-muted/70 hover:bg-black/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
              title="Toggle Codex weekly limit policy"
            >
              <span className="material-symbols-outlined text-[14px]">date_range</span>
              Weekly {codexWeeklyEnabled ? "ON" : "OFF"}
            </button>
          </>
        )}
        {hasProxy &&
          (() => {
            const colorClass =
              proxySource === "global"
                ? "bg-emerald-500/15 text-emerald-500"
                : proxySource === "provider"
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-blue-500/15 text-blue-500";
            const label =
              proxySource === "global"
                ? t("proxySourceGlobal")
                : proxySource === "provider"
                  ? t("proxySourceProvider")
                  : t("proxySourceKey");
            return (
              <span
                className={`inline-flex max-w-full items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium ${colorClass}`}
                title={t("proxyConfiguredBySource", {
                  source: label,
                  host: proxyHost || t("configured"),
                })}
              >
                <span className="material-symbols-outlined shrink-0 text-[14px]">vpn_lock</span>
                <span className="min-w-0 truncate">{proxyHost || t("proxy")}</span>
              </span>
            );
          })()}
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    rateLimitedUntil: PropTypes.string,
    rateLimitProtection: PropTypes.bool,
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    priority: PropTypes.number,
    lastError: PropTypes.string,
    lastErrorType: PropTypes.string,
    lastErrorSource: PropTypes.string,
    errorCode: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    globalPriority: PropTypes.number,
    providerSpecificData: PropTypes.object,
  }).isRequired,
  isOAuth: PropTypes.bool.isRequired,
  isCodex: PropTypes.bool,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onToggleRateLimit: PropTypes.func.isRequired,
  onToggleCodex5h: PropTypes.func,
  onToggleCodexWeekly: PropTypes.func,
  onRetest: PropTypes.func.isRequired,
  isRetesting: PropTypes.bool,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onReauth: PropTypes.func,
  onApplyCodexAuthLocal: PropTypes.func,
  isApplyingCodexAuthLocal: PropTypes.bool,
  onExportCodexAuthFile: PropTypes.func,
  isExportingCodexAuthFile: PropTypes.bool,
  showBulkSelect: PropTypes.bool,
  bulkSelected: PropTypes.bool,
  onToggleBulkSelect: PropTypes.func,
};

function AddApiKeyModal({
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
  const defaultBailianUrl = "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1";
  const isVertex = provider === "vertex";
  const defaultRegion = "us-central1";
  const isGlm = provider === "glm";
  const isQoder = provider === "qoder";

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
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    setSaveError(null);
    try {
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
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!provider || !formData.apiKey) return;

    setSaving(true);
    setSaveError(null);
    try {
      let validatedBailianBaseUrl = null;
      if (isBailian) {
        const checked = normalizeAndValidateHttpBaseUrl(formData.baseUrl, defaultBailianUrl);
        if (checked.error) {
          setSaveError(checked.error);
          return;
        }
        validatedBailianBaseUrl = checked.value;
      }

      let isValid = false;
      try {
        setValidating(true);
        setValidationResult(null);
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
        isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
      } catch {
        setValidationResult("failed");
      } finally {
        setValidating(false);
      }

      if (!isValid) {
        setSaveError(t("apiKeyValidationFailed"));
        return;
      }

      const providerSpecificData: Record<string, unknown> = {};
      if (formData.customUserAgent.trim()) {
        providerSpecificData.customUserAgent = formData.customUserAgent.trim();
      }
      if (isBailian) {
        providerSpecificData.baseUrl = validatedBailianBaseUrl;
      } else if (isVertex) {
        providerSpecificData.region = formData.region;
      } else if (isGlm) {
        providerSpecificData.apiRegion = formData.apiRegion;
      }

      const payload = {
        name: formData.name,
        apiKey: formData.apiKey,
        priority: formData.priority,
        testStatus: "active",
        providerSpecificData:
          Object.keys(providerSpecificData).length > 0 ? providerSpecificData : undefined,
      };

      const error = await onSave(payload);
      if (error) {
        setSaveError(typeof error === "string" ? error : t("failedSaveConnection"));
      }
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
                  ? "Paste your Qoder Personal Access Token"
                  : undefined
            }
            hint={
              isQoder
                ? "Supported path: PAT via qodercli. Browser OAuth remains experimental."
                : undefined
            }
          />
          <div className="pt-6">
            <Button
              onClick={handleValidate}
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

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerName: PropTypes.string,
  isCompatible: PropTypes.bool,
  isAnthropic: PropTypes.bool,
  isCcCompatible: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function normalizeAndValidateHttpBaseUrl(rawValue, fallbackUrl) {
  const value = (typeof rawValue === "string" ? rawValue.trim() : "") || fallbackUrl;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { value: null, error: "Base URL must use http or https" };
    }
    return { value, error: null };
  } catch {
    return { value: null, error: "Base URL must be a valid URL" };
  }
}

function EditConnectionModal({ isOpen, connection, onSave, onClose }: EditConnectionModalProps) {
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
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraApiKeys, setExtraApiKeys] = useState<string[]>([]);
  const [newExtraKey, setNewExtraKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isBailian = connection?.provider === "bailian-coding-plan";
  const defaultBailianUrl = "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1";
  const isVertex = connection?.provider === "vertex";
  const isGlm = connection?.provider === "glm";
  const defaultRegion = "us-central1";

  useEffect(() => {
    if (connection) {
      const rawBaseUrl = connection.providerSpecificData?.baseUrl;
      const existingBaseUrl = typeof rawBaseUrl === "string" ? rawBaseUrl : "";
      const rawRegion = connection.providerSpecificData?.region;
      const existingRegion = typeof rawRegion === "string" ? rawRegion : "";
      const rawCustomUserAgent = connection.providerSpecificData?.customUserAgent;
      const existingCustomUserAgent =
        typeof rawCustomUserAgent === "string" ? rawCustomUserAgent : "";
      setFormData({
        name: connection.name || "",
        priority: connection.priority || 1,
        apiKey: "",
        healthCheckInterval: connection.healthCheckInterval ?? 60,
        baseUrl: existingBaseUrl || (isBailian ? defaultBailianUrl : ""),
        region: existingRegion || (isVertex ? defaultRegion : ""),
        apiRegion: (connection.providerSpecificData?.apiRegion as string) || "international",
        validationModelId: (connection.providerSpecificData?.validationModelId as string) || "",
        tag: (connection.providerSpecificData?.tag as string) || "",
        customUserAgent: existingCustomUserAgent,
      });
      // Load existing extra keys from providerSpecificData
      const existing = connection.providerSpecificData?.extraApiKeys;
      setExtraApiKeys(Array.isArray(existing) ? existing : []);
      setNewExtraKey("");
      setShowAdvanced(!!existingCustomUserAgent);
      setTestResult(null);
      setValidationResult(null);
      setSaveError(null);
    }
  }, [connection, isBailian, isVertex]);

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

  const handleValidate = async () => {
    if (!connection?.provider || !formData.apiKey) return;
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
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updates: any = {
        name: formData.name,
        priority: formData.priority,
        healthCheckInterval: formData.healthCheckInterval,
      };

      let validatedBailianBaseUrl = null;
      if (isBailian) {
        const checked = normalizeAndValidateHttpBaseUrl(formData.baseUrl, defaultBailianUrl);
        if (checked.error) {
          setSaveError(checked.error);
          return;
        }
        validatedBailianBaseUrl = checked.value;
      }

      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        let isValid = validationResult === "success";
        if (!isValid) {
          try {
            setValidating(true);
            setValidationResult(null);
            const res = await fetch("/api/providers/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: connection.provider,
                apiKey: formData.apiKey,
                validationModelId: formData.validationModelId || undefined,
                customUserAgent: formData.customUserAgent.trim() || undefined,
              }),
            });
            const data = await res.json();
            isValid = !!data.valid;
            setValidationResult(isValid ? "success" : "failed");
          } catch {
            setValidationResult("failed");
          } finally {
            setValidating(false);
          }
        }
        if (isValid) {
          updates.testStatus = "active";
          updates.lastError = null;
          updates.lastErrorAt = null;
          updates.lastErrorType = null;
          updates.lastErrorSource = null;
          updates.errorCode = null;
          updates.rateLimitedUntil = null;
        }
      }
      // Persist extra API keys and baseUrl in providerSpecificData
      if (!isOAuth) {
        updates.providerSpecificData = {
          ...(connection.providerSpecificData || {}),
          extraApiKeys: extraApiKeys.filter((k) => k.trim().length > 0),
          tag: formData.tag.trim() || undefined,
          customUserAgent: formData.customUserAgent.trim(),
        };
        if (formData.validationModelId) {
          updates.providerSpecificData.validationModelId = formData.validationModelId;
        }
        // Update baseUrl for bailian-coding-plan
        if (isBailian) {
          updates.providerSpecificData.baseUrl = validatedBailianBaseUrl;
        } else if (isVertex) {
          updates.providerSpecificData.region = formData.region;
        } else if (isGlm) {
          updates.providerSpecificData.apiRegion = formData.apiRegion;
        }
      } else {
        // Also persist tag for OAuth accounts
        updates.providerSpecificData = {
          ...(connection.providerSpecificData || {}),
          tag: formData.tag.trim() || undefined,
        };
      }
      const error = (await onSave(updates)) as void | unknown;
      if (error) {
        setSaveError(typeof error === "string" ? error : t("failedSaveConnection"));
      }
    } finally {
      setSaving(false);
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
            setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })
          }
        />
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
                  onClick={handleValidate}
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

        {/* T07: Extra API Keys for round-robin rotation */}
        {!isOAuth && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-main">
              Extra API Keys
              <span className="ml-2 text-[11px] font-normal text-text-muted">
                (round-robin rotation — optional)
              </span>
            </label>
            {extraApiKeys.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {extraApiKeys.map((key, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs bg-sidebar/50 px-3 py-2 rounded border border-border text-text-muted truncate">
                      {`Key #${idx + 2}: ${key.slice(0, 6)}...${key.slice(-4)}`}
                    </span>
                    <button
                      onClick={() => setExtraApiKeys(extraApiKeys.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-500"
                      title="Remove this key"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="password"
                value={newExtraKey}
                onChange={(e) => setNewExtraKey(e.target.value)}
                placeholder="Add another API key..."
                className="flex-1 text-sm bg-sidebar/50 border border-border rounded px-3 py-2 text-text-main placeholder:text-text-muted focus:ring-1 focus:ring-primary outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newExtraKey.trim()) {
                    setExtraApiKeys([...extraApiKeys, newExtraKey.trim()]);
                    setNewExtraKey("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newExtraKey.trim()) {
                    setExtraApiKeys([...extraApiKeys, newExtraKey.trim()]);
                    setNewExtraKey("");
                  }
                }}
                disabled={!newExtraKey.trim()}
                className="px-3 py-2 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 text-sm font-medium"
              >
                Add
              </button>
            </div>
            {extraApiKeys.length > 0 && (
              <p className="text-[11px] text-text-muted">
                {extraApiKeys.length + 1} keys total — rotating round-robin on each request.
              </p>
            )}
          </div>
        )}

        {/* Test Connection */}
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
                  <Badge variant={testErrorMeta.variant}>{t(testErrorMeta.labelKey)}</Badge>
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

EditConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    priority: PropTypes.number,
    authType: PropTypes.string,
    provider: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function EditCompatibleNodeModal({
  isOpen,
  node,
  onSave,
  onClose,
  isAnthropic,
  isCcCompatible,
}: EditCompatibleNodeModalProps) {
  const t = useTranslations("providers");
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
    chatPath: "",
    modelsPath: "",
  });
  const [saving, setSaving] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        apiType: node.apiType || "chat",
        baseUrl:
          node.baseUrl ||
          (isCcCompatible
            ? "https://api.anthropic.com"
            : isAnthropic
              ? "https://api.anthropic.com/v1"
              : "https://api.openai.com/v1"),
        chatPath: node.chatPath || (isCcCompatible ? CC_COMPATIBLE_DEFAULT_CHAT_PATH : ""),
        modelsPath: isCcCompatible ? "" : node.modelsPath || "",
      });
      setShowAdvanced(
        !!(
          node.chatPath ||
          (!isCcCompatible && node.modelsPath) ||
          (isCcCompatible && !node.chatPath)
        )
      );
    }
  }, [node, isAnthropic, isCcCompatible]);

  const apiTypeOptions = [
    { value: "chat", label: t("chatCompletions") },
    { value: "responses", label: t("responsesApi") },
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
        chatPath: formData.chatPath || (isCcCompatible ? CC_COMPATIBLE_DEFAULT_CHAT_PATH : ""),
        modelsPath: isCcCompatible ? "" : formData.modelsPath,
      };
      if (!isAnthropic) {
        payload.apiType = formData.apiType;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: isAnthropic ? "anthropic-compatible" : "openai-compatible",
          compatMode: isCcCompatible ? "cc" : undefined,
          chatPath: formData.chatPath || (isCcCompatible ? CC_COMPATIBLE_DEFAULT_CHAT_PATH : ""),
          modelsPath: isCcCompatible ? "" : formData.modelsPath,
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  if (!node) return null;

  return (
    <Modal
      isOpen={isOpen}
      title={
        isCcCompatible
          ? CC_COMPATIBLE_DETAILS_TITLE
          : t("editCompatibleTitle", { type: isAnthropic ? t("anthropic") : t("openai") })
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={isCcCompatible ? "Name" : t("nameLabel")}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={
            isCcCompatible
              ? "CC Compatible Production"
              : t("compatibleProdPlaceholder", {
                  type: isAnthropic ? t("anthropic") : t("openai"),
                })
          }
          hint={isCcCompatible ? "Display name for this provider" : t("nameHint")}
        />
        <Input
          label={isCcCompatible ? "Prefix" : t("prefixLabel")}
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder={
            isCcCompatible
              ? "cc"
              : isAnthropic
                ? t("anthropicPrefixPlaceholder")
                : t("openaiPrefixPlaceholder")
          }
          hint={isCcCompatible ? "Used for aliases such as prefix/model-id" : t("prefixHint")}
        />
        {!isAnthropic && (
          <Select
            label={t("apiTypeLabel")}
            options={apiTypeOptions}
            value={formData.apiType}
            onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
          />
        )}
        <Input
          label={isCcCompatible ? "Base URL" : t("baseUrlLabel")}
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={
            isCcCompatible
              ? "https://example.com/v1"
              : isAnthropic
                ? t("anthropicBaseUrlPlaceholder")
                : t("openaiBaseUrlPlaceholder")
          }
          hint={
            isCcCompatible
              ? "Base URL for the CC-compatible site. Do not include /messages."
              : t("compatibleBaseUrlHint", {
                  type: isAnthropic ? t("anthropic") : t("openai"),
                })
          }
        />
        <button
          type="button"
          className="text-sm text-text-muted hover:text-text-primary flex items-center gap-1"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-settings"
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
          <div id="advanced-settings" className="flex flex-col gap-3 pl-2 border-l-2 border-border">
            <Input
              label={isCcCompatible ? "Chat Path" : t("chatPathLabel")}
              value={formData.chatPath}
              onChange={(e) => setFormData({ ...formData, chatPath: e.target.value })}
              placeholder={
                isCcCompatible
                  ? CC_COMPATIBLE_DEFAULT_CHAT_PATH
                  : isAnthropic
                    ? "/messages"
                    : t("chatPathPlaceholder")
              }
              hint={
                isCcCompatible
                  ? "Defaults to the strict Claude Code-compatible messages path"
                  : t("chatPathHint")
              }
            />
            {!isCcCompatible && (
              <Input
                label={t("modelsPathLabel")}
                value={formData.modelsPath}
                onChange={(e) => setFormData({ ...formData, modelsPath: e.target.value })}
                placeholder={t("modelsPathPlaceholder")}
                hint={t("modelsPathHint")}
              />
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            label={t("apiKeyForCheck")}
            type="password"
            value={checkKey}
            onChange={(e) => setCheckKey(e.target.value)}
            className="flex-1"
          />
          <div className="pt-6">
            <Button
              onClick={handleValidate}
              disabled={!checkKey || validating || !formData.baseUrl.trim()}
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
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={
              !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || saving
            }
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

EditCompatibleNodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    apiType: PropTypes.string,
    baseUrl: PropTypes.string,
    chatPath: PropTypes.string,
    modelsPath: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isAnthropic: PropTypes.bool,
  isCcCompatible: PropTypes.bool,
};
