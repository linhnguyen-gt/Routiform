"use client";

import { useState, useEffect } from "react";
import {
  PROTOCOL_COLORS,
  PROVIDER_COLORS,
  getHttpStatusStyle as getStatusStyle,
} from "@/shared/constants/colors";
import {
  formatDuration,
  formatApiKeyLabel,
  computeTokensPerSecond,
  formatTokensPerSecondValue,
} from "@/shared/utils/formatting";

// ─── Payload Code Block ─────────────────────────────────────────────────────

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function truncateText(value, max = 180) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function formatSummaryValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return "Object";
  return String(value);
}

function buildPayloadSummary(payload) {
  if (!payload) return { stats: [], notes: [] };

  if (Array.isArray(payload)) {
    return {
      stats: [{ label: "Items", value: `${payload.length}` }],
      notes: [],
    };
  }

  const record = toRecord(payload);
  if (!record) {
    return {
      stats: [{ label: "Value", value: formatSummaryValue(payload) }],
      notes: [],
    };
  }

  const stats = [];
  const notes = [];
  const data = Array.isArray(record.data) ? record.data : null;
  const usage = toRecord(record.usage);
  const error = toRecord(record.error);
  const firstDataItem = data && data.length > 0 ? toRecord(data[0]) : null;

  if (record.model) stats.push({ label: "Model", value: formatSummaryValue(record.model) });
  if (record.size) stats.push({ label: "Size", value: formatSummaryValue(record.size) });
  if (record.quality) stats.push({ label: "Quality", value: formatSummaryValue(record.quality) });
  if (record.style) stats.push({ label: "Style", value: formatSummaryValue(record.style) });
  if (record.n) stats.push({ label: "Count", value: formatSummaryValue(record.n) });
  if (record.created) stats.push({ label: "Created", value: formatSummaryValue(record.created) });
  if (record.response_format) {
    stats.push({ label: "Format", value: formatSummaryValue(record.response_format) });
  }

  if (data) {
    stats.push({ label: "Results", value: `${data.length}` });
    if (firstDataItem?.url) {
      stats.push({ label: "Output", value: "Image URLs" });
    } else if (firstDataItem?.b64_json) {
      stats.push({ label: "Output", value: "Base64 images" });
    }
  }

  if (usage) {
    if (usage.input_tokens !== undefined) {
      stats.push({ label: "Input", value: formatSummaryValue(usage.input_tokens) });
    }
    if (usage.output_tokens !== undefined) {
      stats.push({ label: "Output", value: formatSummaryValue(usage.output_tokens) });
    }
    if (usage.total_tokens !== undefined) {
      stats.push({ label: "Total", value: formatSummaryValue(usage.total_tokens) });
    }
  }

  const promptPreview = truncateText(record.prompt, 220);
  if (promptPreview) notes.push({ label: "Prompt", value: promptPreview });

  const revisedPrompt =
    truncateText(record.revised_prompt, 220) || truncateText(firstDataItem?.revised_prompt, 220);
  if (revisedPrompt) notes.push({ label: "Revised Prompt", value: revisedPrompt });

  const firstUrl = truncateText(firstDataItem?.url, 220);
  if (firstUrl) notes.push({ label: "First URL", value: firstUrl });

  const errorMessage =
    truncateText(error?.message, 220) ||
    truncateText(record.message, 220) ||
    truncateText(record.error, 220);
  if (errorMessage) notes.push({ label: "Error", value: errorMessage });

  return {
    stats: stats.slice(0, 8),
    notes: notes.slice(0, 4),
  };
}

function PayloadSection({ title, payload, json, onCopy }) {
  const [copied, setCopied] = useState(false);
  const summary = buildPayloadSummary(payload);

  const handleCopy = async () => {
    const success = await onCopy();
    if (success !== false) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg-subtle/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] text-text-muted uppercase tracking-wider font-bold">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          aria-label={`Copy ${title}`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {summary.stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {summary.stats.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="rounded-lg border border-border bg-bg px-3 py-2"
            >
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {item.label}
              </div>
              <div className="text-sm font-medium text-text-main break-words">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {summary.notes.length > 0 && (
        <div className="space-y-2 mb-3">
          {summary.notes.map((item) => (
            <div
              key={`${title}-${item.label}-note`}
              className="rounded-lg bg-black/5 dark:bg-black/20 px-3 py-2"
            >
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {item.label}
              </div>
              <div className="text-sm text-text-main break-words">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-border bg-black/5 dark:bg-black/20">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-muted hover:text-text-main transition-colors">
          View raw JSON
        </summary>
        <pre className="border-t border-border p-4 overflow-x-auto text-xs font-mono text-text-main max-h-[420px] overflow-y-auto leading-relaxed whitespace-pre-wrap break-words">
          {json}
        </pre>
      </details>
    </div>
  );
}

// ─── Detail Modal ───────────────────────────────────────────────────────────

export default function RequestLoggerDetail({ log, detail, loading, onClose, onCopy }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const statusStyle = getStatusStyle(log.status);
  const protocolKey = log.sourceFormat || log.provider;
  const protocol = PROTOCOL_COLORS[protocolKey] ||
    PROTOCOL_COLORS[log.provider] || {
      bg: "#6B7280",
      text: "#fff",
      label: (protocolKey || log.provider || "-").toUpperCase(),
    };
  const providerColor = PROVIDER_COLORS[log.provider] || {
    bg: "#374151",
    text: "#fff",
    label: (log.provider || "-").toUpperCase(),
  };

  const formatDate = (iso) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString("pt-BR") + ", " + d.toLocaleTimeString("en-US", { hour12: false })
      );
    } catch {
      return iso;
    }
  };

  const toPrettyJson = (payload) => {
    if (payload === null || payload === undefined) return null;
    if (payload && typeof payload === "object" && !Array.isArray(payload) && payload._artifactOnly)
      return null;
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  const pipelinePayloads = detail?.pipelinePayloads || null;
  const payloadSections = pipelinePayloads
    ? [
        ["clientRawRequest", "Client Raw Request"],
        ["clientRequest", "Client Request"],
        ["openaiRequest", "OpenAI Request"],
        ["providerRequest", "Provider Request"],
        ["providerResponse", "Provider Response"],
        ["clientResponse", "Client Response"],
        ["error", "Pipeline Error"],
      ]
        .map(([key, title]) => ({
          key,
          title,
          payload: pipelinePayloads[key],
          json: toPrettyJson(pipelinePayloads[key]),
        }))
        .filter((section) => section.json)
    : [];
  const requestJson = detail?.requestBody ? toPrettyJson(detail.requestBody) : null;
  const responseJson = detail?.responseBody ? toPrettyJson(detail.responseBody) : null;
  const tokenIn = detail?.tokens?.in ?? log.tokens?.in ?? 0;
  const tokenOut = detail?.tokens?.out ?? log.tokens?.out ?? 0;
  const tokenCacheRead = detail?.tokens?.cacheRead ?? log.tokens?.cacheRead ?? null;
  const tokenCacheCreation = detail?.tokens?.cacheCreation ?? log.tokens?.cacheCreation ?? null;
  const tokenReasoning = detail?.tokens?.reasoning ?? log.tokens?.reasoning ?? null;
  const durationMs = detail?.duration ?? log.duration ?? 0;
  const tokensPerSecond = computeTokensPerSecond(tokenOut, durationMs);

  // Extract reasoning effort from request body
  // Try providerRequest first (has transformed body with reasoning.effort set by executor)
  // Fall back to clientRequest if providerRequest not available
  const payloads = ((detail as Record<string, unknown>)?.pipelinePayloads ??
    (detail as Record<string, unknown>)?.pipeline) as Record<string, unknown> | undefined;
  const providerRequestWrapper = payloads?.providerRequest as Record<string, unknown> | undefined;
  const providerRequestBody = providerRequestWrapper?.body as Record<string, unknown> | undefined;
  const clientRequestBody = (payloads?.clientRequest ?? detail?.requestBody) as
    | Record<string, unknown>
    | undefined;

  const reasoningEffort =
    (providerRequestBody?.reasoning as Record<string, unknown>)?.effort ??
    providerRequestBody?.reasoning_effort ??
    (clientRequestBody?.reasoning as Record<string, unknown>)?.effort ??
    clientRequestBody?.reasoning_effort ??
    null;

  const formatNullableToken = (value) => {
    if (value === null || value === undefined) return "N/A";
    return Number(value).toLocaleString();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Request log detail"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-border rounded-xl w-full max-w-[900px] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-bg-primary/95 backdrop-blur-sm rounded-t-xl">
          <div className="flex items-center gap-3">
            <span
              className="inline-block px-2.5 py-1 rounded text-xs font-bold"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {log.status}
            </span>
            <span className="font-bold text-lg">{log.method}</span>
            <span className="text-text-muted font-mono text-sm">{log.path}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-subtle text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close detail modal"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Request Overview - Time & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-bg-subtle rounded-xl border border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Time</div>
              <div className="text-sm font-medium">{formatDate(log.timestamp)}</div>
            </div>
            <div className="p-4 bg-bg-subtle rounded-xl border border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Duration
              </div>
              <div className="text-sm font-medium">{formatDuration(durationMs)}</div>
            </div>
          </div>

          {/* Token Metrics */}
          <div className="p-4 bg-bg-subtle rounded-xl border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">
              Token Usage
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Input</span>
                <span className="px-2.5 py-1 rounded bg-primary/20 text-primary text-sm font-bold">
                  {tokenIn.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Output</span>
                <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                  {tokenOut.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Cache Read</span>
                <span className="px-2.5 py-1 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-sm font-bold">
                  {formatNullableToken(tokenCacheRead)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Cache Write</span>
                <span className="px-2.5 py-1 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-sm font-bold">
                  {formatNullableToken(tokenCacheCreation)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Reasoning</span>
                <span className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-sm font-bold">
                  {formatNullableToken(tokenReasoning)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Effort</span>
                <span className="px-2.5 py-1 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 text-sm font-bold">
                  {String(reasoningEffort || "N/A")}
                </span>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div className="p-4 bg-bg-subtle rounded-xl border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Performance
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 text-sm font-bold">
                {formatTokensPerSecondValue(tokensPerSecond)} tok/s
              </span>
            </div>
          </div>

          {/* Model & Provider Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-bg-subtle rounded-xl border border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">Model</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">Actual</span>
                  <span className="text-sm font-medium text-primary font-mono">{log.model}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">Requested</span>
                  <span
                    className={`text-sm font-medium font-mono ${
                      (detail?.requestedModel || log.requestedModel) &&
                      (detail?.requestedModel || log.requestedModel) !== log.model
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-text-muted"
                    }`}
                  >
                    {detail?.requestedModel || log.requestedModel || "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-bg-subtle rounded-xl border border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">
                Provider
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">Name</span>
                  <span
                    className="inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase"
                    style={{ backgroundColor: providerColor.bg, color: providerColor.text }}
                  >
                    {providerColor.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">Protocol</span>
                  <span
                    className="inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase"
                    style={{ backgroundColor: protocol.bg, color: protocol.text }}
                  >
                    {protocol.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Account & Authentication */}
          <div className="p-4 bg-bg-subtle rounded-xl border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">
              Authentication
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Account</span>
                <span className="text-sm font-medium">{detail?.account || log.account || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">API Key</span>
                <span
                  className="text-sm font-medium"
                  title={
                    detail?.apiKeyName ||
                    detail?.apiKeyId ||
                    log.apiKeyName ||
                    log.apiKeyId ||
                    "No API key"
                  }
                >
                  {formatApiKeyLabel(
                    detail?.apiKeyName || log.apiKeyName,
                    detail?.apiKeyId || log.apiKeyId
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">Combo</span>
                {detail?.comboName || log.comboName ? (
                  <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 w-fit">
                    {detail?.comboName || log.comboName}
                  </span>
                ) : (
                  <span className="text-sm text-text-muted">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {(detail?.error || log.error) && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider mb-1 font-bold">
                Error
              </div>
              <div className="text-sm text-red-600 dark:text-red-300 font-mono">
                {detail?.error || log.error}
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-text-muted animate-pulse">
              Loading request details...
            </div>
          ) : (
            <>
              {payloadSections.length > 0 &&
                payloadSections.map((section) => (
                  <PayloadSection
                    key={section.key}
                    title={section.title}
                    payload={section.payload}
                    json={section.json}
                    onCopy={() => onCopy(section.json)}
                  />
                ))}

              {payloadSections.length === 0 && responseJson && (
                <PayloadSection
                  title="Response Payload (Legacy)"
                  payload={detail?.responseBody}
                  json={responseJson}
                  onCopy={() => onCopy(responseJson)}
                />
              )}

              {payloadSections.length === 0 && requestJson && (
                <PayloadSection
                  title="Request Payload (Legacy)"
                  payload={detail?.requestBody}
                  json={requestJson}
                  onCopy={() => onCopy(requestJson)}
                />
              )}

              {payloadSections.length === 0 && !requestJson && !responseJson && !loading && (
                <div className="p-6 text-center text-text-muted">
                  <span className="material-symbols-outlined text-[32px] mb-2 block opacity-40">
                    info
                  </span>
                  <p className="text-sm">No payload data available for this log entry.</p>
                  <p className="text-xs mt-1">
                    Enable detailed logging first if you want the four-stage client/provider payload
                    view for new requests.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
