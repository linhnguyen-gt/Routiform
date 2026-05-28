"use client";

/**
 * Health Dashboard — Phase 8.3
 *
 * System health overview with cards for:
 * - System status (uptime, version, memory)
 * - Provider health (circuit breaker states)
 * - Rate limit status
 * - Active lockouts
 * - Signature cache stats
 * - Latency telemetry & prompt cache
 */

import { useState, useCallback } from "react";
import { Button, Card } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { useVisiblePolling } from "@/shared/hooks/useVisiblePolling";
import { useTranslations } from "next-intl";

const HEALTH_PAGE_REFRESH_INTERVAL_MS = 30_000;

interface DegradationFeature {
  feature: string;
  level: string;
  capability: string;
  reason?: string;
  since: string;
}

interface CircuitBreakerEntry {
  state: string;
  failures: number;
  lastFailure?: string;
}

interface ProviderInfo {
  name?: string;
  color?: string;
  textIcon?: string;
}

interface RateLimitEntryStatus {
  queued?: number;
  running?: number;
}

interface LockoutEntry {
  reason?: string;
  until?: string;
}

interface ParsedRateLimitEntry {
  key: string;
  providerId: string;
  displayName: string;
  providerInfo: ProviderInfo | undefined;
  connectionId: string;
  model: string | null;
  status: RateLimitEntryStatus;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CB_STYLES = {
  CLOSED: { bg: "bg-green-500/10", text: "text-green-500", labelKey: "healthy" },
  OPEN: { bg: "bg-red-500/10", text: "text-red-500", labelKey: "down" },
  HALF_OPEN: { bg: "bg-amber-500/10", text: "text-amber-500", labelKey: "recovering" },
};

export default function HealthPage() {
  const t = useTranslations("health");
  const tc = useTranslations("common");
  const tp = useTranslations("providers");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [cache, setCache] = useState(null);
  const [signatureCache, setSignatureCache] = useState(null);
  const [degradation, setDegradation] = useState(null);
  const [resetting, setResetting] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Fetch telemetry, cache, and signature cache stats
  const fetchExtras = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch("/api/telemetry/summary").then((r) => r.json()),
      fetch("/api/cache/stats").then((r) => r.json()),
      fetch("/api/rate-limits").then((r) => r.json()),
      fetch("/api/health/degradation").then((r) => r.json()),
    ]);
    if (results[0].status === "fulfilled") setTelemetry(results[0].value);
    if (results[1].status === "fulfilled") setCache(results[1].value);
    if (results[2].status === "fulfilled" && results[2].value.cacheStats) {
      setSignatureCache(results[2].value.cacheStats);
    }
    if (results[3].status === "fulfilled") setDegradation(results[3].value);
  }, []);

  const refreshHealthPage = useCallback(() => {
    fetchHealth();
    fetchExtras();
  }, [fetchHealth, fetchExtras]);

  useVisiblePolling(refreshHealthPage, { intervalMs: HEALTH_PAGE_REFRESH_INTERVAL_MS });

  const handleResetHealth = async () => {
    if (!confirm(t("resetConfirm"))) return;
    setResetting(true);
    try {
      const res = await fetch("/api/monitoring/health", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh health data immediately
      await Promise.all([fetchHealth(), fetchExtras()]);
    } catch (err) {
      console.error("Failed to reset health:", err);
    } finally {
      setResetting(false);
    }
  };

  const fmtMs = (ms) =>
    ms != null ? t("millisecondsShort", { value: Math.round(ms) }) : t("notAvailable");

  if (!data && !error) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Card className="w-full max-w-md border border-border-subtle bg-surface/70" padding="lg">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-text-muted mt-4">{t("loadingHealth")}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <Card className="bg-red-500/10 border border-red-500/30" padding="lg">
          <div className="text-center">
            <span className="material-symbols-outlined text-red-500 text-[32px] mb-2">error</span>
            <p className="text-red-400">{t("failedToLoad", { error })}</p>
            <div className="mt-4 flex justify-center">
              <Button size="sm" variant="secondary" onClick={fetchHealth} icon="refresh">
                {t("retry")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { system, providerHealth, providerSummary, rateLimitStatus, lockouts } = data;
  const cbEntries = Object.entries(providerHealth || {});
  const lockoutEntries = Object.entries(lockouts || {});

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-text-main">{t("title")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:justify-end">
          {lastRefresh && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface/60 px-2.5 py-1 text-xs text-text-muted">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                schedule
              </span>
              {t("updatedAt", { time: lastRefresh.toLocaleTimeString() })}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            onClick={() => {
              fetchHealth();
              fetchExtras();
            }}
            aria-label={tc("refresh")}
          >
            {tc("refresh")}
          </Button>
        </div>
      </header>

      {/* Status Banner */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl p-4 border flex items-center gap-3 ${
          data.status === "healthy"
            ? "bg-green-500/10 border-green-500/20"
            : "bg-red-500/10 border-red-500/20"
        }`}
      >
        <span
          className={`material-symbols-outlined text-[24px] ${
            data.status === "healthy" ? "text-green-500" : "text-red-500"
          }`}
        >
          {data.status === "healthy" ? "check_circle" : "error"}
        </span>
        <span className={data.status === "healthy" ? "text-green-400" : "text-red-400"}>
          {data.status === "healthy" ? t("allOperational") : t("issuesDetected")}
        </span>
      </div>

      {/* System Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[18px]">timer</span>
            </div>
            <span className="text-sm text-text-muted">{t("uptime")}</span>
          </div>
          <p className="text-xl font-semibold text-text-main">{formatUptime(system.uptime)}</p>
        </Card>

        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined text-[18px]">info</span>
            </div>
            <span className="text-sm text-text-muted">{t("version")}</span>
          </div>
          <p className="text-xl font-semibold text-text-main">v{system.version}</p>
          <p className="text-xs text-text-muted mt-1">
            {t("nodeVersion", { version: system.nodeVersion })}
          </p>
        </Card>

        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-purple-500/10 text-purple-500">
              <span className="material-symbols-outlined text-[18px]">memory</span>
            </div>
            <span className="text-sm text-text-muted">{t("memoryRss")}</span>
          </div>
          <p className="text-xl font-semibold text-text-main">
            {formatBytes(system.memoryUsage?.rss || 0)}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {t("heap")}: {formatBytes(system.memoryUsage?.heapUsed || 0)} /{" "}
            {formatBytes(system.memoryUsage?.heapTotal || 0)}
          </p>
        </Card>

        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 text-amber-500">
              <span className="material-symbols-outlined text-[18px]">dns</span>
            </div>
            <span className="text-sm text-text-muted">{t("providers")}</span>
          </div>
          <p className="text-xl font-semibold text-text-main">
            {providerSummary?.configuredCount ?? cbEntries.length}
          </p>
          <div className="mt-2 space-y-1.5">
            <p
              className="text-[11px] text-text-muted inline-flex items-center gap-1"
              title={t("configuredProvidersHint")}
            >
              {t("configuredProvidersLabel")}
              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                help
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span
                className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
                title={t("activeProvidersHint")}
              >
                {t("activeProviders", { count: providerSummary?.activeCount ?? 0 })}
              </span>
              <span
                className="inline-flex items-center rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-400"
                title={t("monitoredProvidersHint")}
              >
                {t("monitoredProviders", {
                  count: providerSummary?.monitoredCount ?? cbEntries.length,
                })}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Graceful Degradation Status */}
      {degradation && degradation.features && degradation.features.length > 0 && (
        <Card
          className="border border-border-subtle bg-surface/70"
          padding="lg"
          role="region"
          aria-label="Graceful Degradation Status"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">healing</span>
              Graceful Degradation Status
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted font-medium">
              <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400">
                Full: {degradation.summary.full}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">
                Reduced: {degradation.summary.reduced}
              </span>
              <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-500">
                Minimal: {degradation.summary.minimal}
              </span>
              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500">
                Default: {degradation.summary.default}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {degradation.features.map((feat: DegradationFeature) => {
              const bg =
                feat.level === "full"
                  ? "bg-green-500/5 border-green-500/10"
                  : feat.level === "reduced"
                    ? "bg-amber-500/5 border-amber-500/20"
                    : feat.level === "minimal"
                      ? "bg-orange-500/5 border-orange-500/20"
                      : "bg-red-500/5 border-red-500/20";
              const dot =
                feat.level === "full"
                  ? "bg-green-500"
                  : feat.level === "reduced"
                    ? "bg-amber-500"
                    : feat.level === "minimal"
                      ? "bg-orange-500"
                      : "bg-red-500";
              return (
                <div
                  key={feat.feature}
                  className={`rounded-lg p-3 border ${bg} flex flex-col gap-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize flex items-center gap-2 text-[var(--text-primary,#fff)]">
                      <span className={`w-2 h-2 rounded-full ${dot}`}></span>
                      {feat.feature}
                    </span>
                    <span className="text-xs uppercase tracking-wider font-bold opacity-70">
                      {feat.level}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary,#aaa)]">{feat.capability}</div>
                  {feat.reason && (
                    <div
                      className="text-[10px] text-red-300 mt-1 bg-red-900/20 p-1.5 rounded"
                      title={feat.reason}
                    >
                      {feat.reason.length > 80 ? feat.reason.substring(0, 80) + "..." : feat.reason}
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--text-muted,#666)] text-right mt-1">
                    Since {new Date(feat.since).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Telemetry Cards — Latency & Prompt Cache */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Latency Card */}
        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <h3 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">speed</span>
            {t("latency")}
          </h3>
          {telemetry ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">{t("latencyP50")}</span>
                <span className="font-mono">{fmtMs(telemetry.p50)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t("latencyP95")}</span>
                <span className="font-mono">{fmtMs(telemetry.p95)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t("latencyP99")}</span>
                <span className="font-mono">{fmtMs(telemetry.p99)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 mt-2">
                <span className="text-text-muted">{t("totalRequests")}</span>
                <span className="font-mono">{telemetry.totalRequests ?? 0}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t("noDataYet")}</p>
          )}
        </Card>

        {/* Prompt Cache Card */}
        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <h3 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">cached</span>
            {t("promptCache")}
          </h3>
          {cache ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">{t("entries")}</span>
                <span className="font-mono">
                  {cache.size}/{cache.maxSize}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t("hitRate")}</span>
                <span className="font-mono">{cache.hitRate?.toFixed(1) ?? 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t("hitsMisses")}</span>
                <span className="font-mono">
                  {cache.hits ?? 0} / {cache.misses ?? 0}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t("noDataYet")}</p>
          )}
        </Card>

        {/* Signature Cache Card */}
        <Card className="border border-border-subtle bg-surface/70" padding="sm">
          <h3 className="text-sm font-semibold text-text-muted mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">database</span>
            {t("signatureCache")}
          </h3>
          {signatureCache ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: t("signatureDefaults"),
                  value: signatureCache.defaultCount,
                  color: "text-text-muted",
                },
                {
                  label: t("signatureTool"),
                  value: `${signatureCache.tool.entries}/${signatureCache.tool.patterns}`,
                  color: "text-blue-400",
                },
                {
                  label: t("signatureFamily"),
                  value: `${signatureCache.family.entries}/${signatureCache.family.patterns}`,
                  color: "text-purple-400",
                },
                {
                  label: t("signatureSession"),
                  value: `${signatureCache.session.entries}/${signatureCache.session.patterns}`,
                  color: "text-cyan-400",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="text-center p-2 rounded-lg bg-surface/30 border border-border-subtle"
                >
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t("noDataYet")}</p>
          )}
        </Card>
      </div>

      {/* Provider Health */}
      <Card
        className="border border-border-subtle bg-surface/70"
        padding="lg"
        role="region"
        aria-label={t("providerHealthStatusAria")}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">
              health_and_safety
            </span>
            {t("providerHealth")}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {cbEntries.some(([, cb]: [string, CircuitBreakerEntry]) => cb.state !== "CLOSED") && (
              <Button
                size="sm"
                variant="ghost"
                icon={resetting ? "progress_activity" : "restart_alt"}
                onClick={handleResetHealth}
                disabled={resetting}
                aria-label={t("resetAllTitle")}
                className={resetting ? "cursor-wait" : "text-red-400 hover:text-red-300"}
              >
                {resetting ? t("resetting") : t("resetAll")}
              </Button>
            )}
            {cbEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-green-500" /> {t("healthy")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-500" /> {t("recovering")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-red-500" /> {t("down")}
                </span>
              </div>
            )}
          </div>
        </div>
        {cbEntries.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">{t("noCBData")}</p>
        ) : (
          (() => {
            const unhealthy = cbEntries.filter(
              ([, cb]: [string, CircuitBreakerEntry]) => cb.state !== "CLOSED"
            );
            const healthy = cbEntries.filter(
              ([, cb]: [string, CircuitBreakerEntry]) => cb.state === "CLOSED"
            );
            return (
              <div className="space-y-4">
                {/* Unhealthy providers first */}
                {unhealthy.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-red-400 uppercase tracking-wide">
                      {t("issuesLabel")}
                    </p>
                    {unhealthy.map(([provider, cb]: [string, CircuitBreakerEntry]) => {
                      const style = CB_STYLES[cb.state] || CB_STYLES.OPEN;
                      const providerInfo = AI_PROVIDERS[provider];
                      const displayName = providerInfo?.name || provider;
                      return (
                        <div
                          key={provider}
                          className={`rounded-lg p-3 ${style.bg} border border-white/5 flex items-center gap-3`}
                        >
                          <div
                            className="size-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                            style={{
                              backgroundColor: `${providerInfo?.color || "#888"}15`,
                              color: providerInfo?.color || "#888",
                            }}
                          >
                            {providerInfo?.textIcon || provider.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-main truncate">
                                {displayName}
                              </span>
                              <span
                                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
                              >
                                {t(style.labelKey)}
                              </span>
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              {cb.failures === 1
                                ? t("failures", { count: cb.failures })
                                : t("failuresPlural", { count: cb.failures })}
                              {cb.lastFailure && (
                                <span className="ml-2">
                                  · {t("lastFailure")}:{" "}
                                  {new Date(cb.lastFailure).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Healthy providers in compact grid */}
                {healthy.length > 0 && (
                  <div>
                    {unhealthy.length > 0 && (
                      <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-2">
                        {t("operational")}
                      </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {healthy.map(([provider]) => {
                        const providerInfo = AI_PROVIDERS[provider];
                        const displayName = providerInfo?.name || provider;
                        return (
                          <div
                            key={provider}
                            className="rounded-lg p-2.5 bg-green-500/5 border border-white/5 flex items-center gap-2"
                          >
                            <span className="size-2 rounded-full bg-green-500 shrink-0" />
                            <span
                              className="text-xs font-medium text-text-main truncate"
                              title={displayName}
                            >
                              {displayName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </Card>

      {/* Rate Limit Status */}
      {rateLimitStatus &&
        Object.keys(rateLimitStatus).length > 0 &&
        (() => {
          // Parse rate limit keys ("provider:connectionId" or "provider:connectionId:model")
          const parseKey = (key) => {
            const parts = key.split(":");
            const providerId = parts[0];
            const connectionId = parts[1] || "";
            const model = parts.slice(2).join(":") || null;

            // Resolve friendly name
            let displayName;
            let providerInfo = AI_PROVIDERS[providerId];

            if (providerId.startsWith("openai-compatible-")) {
              const customName = providerId.replace("openai-compatible-", "");
              displayName = tp("openaiCompatibleName");
              providerInfo = { color: "#10A37F", textIcon: "OC" };
              if (customName.length > 12) displayName += ` (${customName.slice(0, 8)}…)`;
              else if (customName) displayName += ` (${customName})`;
            } else if (providerId.startsWith("anthropic-compatible-")) {
              const customName = providerId.replace("anthropic-compatible-", "");
              displayName = tp("anthropicCompatibleName");
              providerInfo = { color: "#D97757", textIcon: "AC" };
              if (customName.length > 12) displayName += ` (${customName.slice(0, 8)}…)`;
              else if (customName) displayName += ` (${customName})`;
            } else {
              displayName = providerInfo?.name || providerId;
            }

            return { providerId, displayName, providerInfo, connectionId, model };
          };

          // Group entries by provider for a cleaner display
          const entries = Object.entries(rateLimitStatus).map(
            ([key, status]: [string, RateLimitEntryStatus]) => ({
              key,
              ...parseKey(key),
              status,
            })
          );

          // Sort: active (queued/running > 0) first, then alphabetically
          entries.sort((a, b) => {
            const aActive = (a.status.queued || 0) + (a.status.running || 0);
            const bActive = (b.status.queued || 0) + (b.status.running || 0);
            if (aActive !== bActive) return bActive - aActive;
            return a.displayName.localeCompare(b.displayName);
          });

          return (
            <Card className="border border-border-subtle bg-surface/70" padding="lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-500">
                    speed
                  </span>
                  {t("rateLimitStatus")}
                </h2>
                <span className="text-xs text-text-muted">
                  {entries.length === 1
                    ? t("activeLimiters", { count: entries.length })
                    : t("activeLimitersPlural", { count: entries.length })}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entries.map(
                  ({
                    key,
                    displayName,
                    providerInfo,
                    connectionId,
                    model,
                    status,
                  }: ParsedRateLimitEntry) => {
                    const isActive = (status.queued || 0) + (status.running || 0) > 0;
                    const isQueued = (status.queued || 0) > 0;
                    return (
                      <div
                        key={key}
                        className={`rounded-lg p-3 border transition-colors ${
                          isQueued
                            ? "bg-amber-500/5 border-amber-500/20"
                            : isActive
                              ? "bg-blue-500/5 border-blue-500/15"
                              : "bg-surface/30 border-border-subtle"
                        }`}
                        title={key}
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <div
                            className="size-7 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold"
                            style={{
                              backgroundColor: `${providerInfo?.color || "#888"}15`,
                              color: providerInfo?.color || "#888",
                            }}
                          >
                            {providerInfo?.textIcon || displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-main truncate">
                              {displayName}
                            </p>
                            {connectionId && (
                              <p className="text-[10px] text-text-muted font-mono truncate">
                                {connectionId.length > 12
                                  ? connectionId.slice(0, 8) + "…"
                                  : connectionId}
                                {model && (
                                  <span className="ml-1 text-text-muted/60">· {model}</span>
                                )}
                              </p>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isQueued
                                ? "bg-amber-500/15 text-amber-400"
                                : isActive
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-green-500/10 text-green-400"
                            }`}
                          >
                            {isQueued ? t("queued") : isActive ? tc("active") : t("ok")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-text-muted">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                            {t("queuedCount", { count: status.queued || 0 })}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">
                              play_arrow
                            </span>
                            {t("runningCount", { count: status.running || 0 })}
                          </span>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </Card>
          );
        })()}

      {/* Active Lockouts */}
      {lockoutEntries.length > 0 && (
        <Card className="border border-border-subtle bg-surface/70" padding="lg">
          <h2 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-red-500">lock</span>
            {t("activeLockouts")}
          </h2>
          <div className="space-y-2">
            {lockoutEntries.map(([key, lockout]: [string, LockoutEntry]) => (
              <div
                key={key}
                className="rounded-lg p-3 bg-red-500/5 border border-red-500/10 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm font-medium text-text-main">{key}</span>
                  {lockout.reason && (
                    <span className="text-xs text-text-muted ml-2">({lockout.reason})</span>
                  )}
                </div>
                {lockout.until && (
                  <span className="text-xs text-red-400">
                    {t("until", { time: new Date(lockout.until).toLocaleTimeString() })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
