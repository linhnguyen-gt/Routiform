"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  parseQuotaData,
  resolveUsedDisplayPercentage,
  formatQuotaLabel,
  normalizePlanTier,
  resolvePlanValue,
} from "./utils";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { CardSkeleton } from "@/shared/components/Loading";
import { cn } from "@/shared/utils/cn";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const LS_GROUP_BY = "routiform:limits:groupBy";
const LS_LEGACY_GROUP_BY = "omniroute:limits:groupBy";
const LS_EXPANDED_GROUPS = "routiform:limits:expandedGroups";
const LS_LEGACY_EXPANDED_GROUPS = "omniroute:limits:expandedGroups";

const MIN_FETCH_INTERVAL_MS = 30000; // Debounce per-connection fetches
const QUOTA_BAR_GREEN_THRESHOLD = 50;
const QUOTA_BAR_YELLOW_THRESHOLD = 20;

// Provider display config
const PROVIDER_CONFIG = {
  antigravity: { label: "Antigravity", color: "#F59E0B" },
  "gemini-cli": { label: "Gemini CLI", color: "#4285F4" },
  github: { label: "GitHub Copilot", color: "#333" },
  kiro: { label: "Kiro AI", color: "#FF6B35" },
  codex: { label: "OpenAI Codex", color: "#10A37F" },
  claude: { label: "Claude Code", color: "#D97757" },
  glm: { label: "GLM (Z.AI)", color: "#4A90D9" },
  "kimi-coding": { label: "Kimi Coding", color: "#1E3A8A" },
};

const TIER_FILTERS = [
  { key: "all", labelKey: "tierAll" },
  { key: "enterprise", labelKey: "tierEnterprise" },
  { key: "team", labelKey: "tierTeam" },
  { key: "business", labelKey: "tierBusiness" },
  { key: "ultra", labelKey: "tierUltra" },
  { key: "pro", labelKey: "tierPro" },
  { key: "plus", labelKey: "tierPlus" },
  { key: "free", labelKey: "tierFree" },
  { key: "unknown", labelKey: "tierUnknown" },
];

// Bar colors from **used** % (consumption): low = green, high = red
function getBarColor(usedPercentage) {
  if (usedPercentage < QUOTA_BAR_GREEN_THRESHOLD) {
    return { bar: "#22c55e", text: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  }
  if (usedPercentage < 100 - QUOTA_BAR_YELLOW_THRESHOLD) {
    return { bar: "#eab308", text: "#eab308", bg: "rgba(234,179,8,0.12)" };
  }
  return { bar: "#ef4444", text: "#ef4444", bg: "rgba(239,68,68,0.12)" };
}

// Format countdown
function formatCountdown(resetAt) {
  if (!resetAt) return null;
  try {
    const diff = (new Date(resetAt) as any) - (new Date() as any);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    }
    return `${h}h ${m}m`;
  } catch {
    return null;
  }
}

export default function ProviderLimits() {
  const t = useTranslations("usage");
  const [connections, setConnections] = useState([]);
  const [quotaData, setQuotaData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Record<string, string>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<"none" | "environment">(() => {
    if (typeof window === "undefined") return "none";
    const saved = localStorage.getItem(LS_GROUP_BY) || localStorage.getItem(LS_LEGACY_GROUP_BY);
    if (saved === "environment" || saved === "none") return saved;
    return "none";
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved =
        localStorage.getItem(LS_EXPANDED_GROUPS) || localStorage.getItem(LS_LEGACY_EXPANDED_GROUPS);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const lastFetchTimeRef = useRef({});
  const staleProbeRef = useRef({});
  /** Ensures we pull live /api/usage once per connection after load (cache alone is often empty on cold refresh). */
  const initialLiveQuotaRequestedFor = useRef(new Set<string>());

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/providers/client");
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      const list = data.connections || [];
      setConnections(list);
      return list;
    } catch {
      setConnections([]);
      return [];
    }
  }, []);

  const applyCachedQuotaState = useCallback((connectionList, caches) => {
    const nextQuotaData = {};
    const nextLastRefreshedAt = {};

    for (const conn of connectionList) {
      const cached = caches?.[conn.id];
      if (!cached) continue;

      nextQuotaData[conn.id] = {
        quotas: parseQuotaData(conn.provider, cached),
        plan: cached.plan || null,
        message: cached.message || null,
        raw: cached,
      };

      if (cached.fetchedAt) {
        nextLastRefreshedAt[conn.id] = cached.fetchedAt;
      }
    }

    setQuotaData(nextQuotaData);
    setLastRefreshedAt(nextLastRefreshedAt);
  }, []);

  const fetchCachedProviderLimits = useCallback(async () => {
    try {
      const response = await fetch("/api/usage/provider-limits");
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      return data.caches || {};
    } catch {
      return {};
    }
  }, []);

  const fetchQuota = useCallback(
    async (connectionId, provider, options: { force?: boolean; silent?: boolean } = {}) => {
      const force = options?.force === true;
      const silent = options?.silent === true;
      // Debounce: skip if last fetch was < MIN_FETCH_INTERVAL_MS ago
      const now = Date.now();
      const lastFetch = lastFetchTimeRef.current[connectionId] || 0;
      if (!force && now - lastFetch < MIN_FETCH_INTERVAL_MS) {
        return; // Skip, data is still fresh
      }
      lastFetchTimeRef.current[connectionId] = now;

      if (!silent) {
        setLoading((prev) => ({ ...prev, [connectionId]: true }));
      }
      setErrors((prev) => ({ ...prev, [connectionId]: null }));
      try {
        const response = await fetch(`/api/usage/${connectionId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || response.statusText;
          if (response.status === 404) return;
          if (response.status === 401) {
            setQuotaData((prev) => ({
              ...prev,
              [connectionId]: { quotas: [], message: errorMsg },
            }));
            return;
          }
          throw new Error(`HTTP ${response.status}: ${errorMsg}`);
        }
        const data = await response.json();
        const parsedQuotas = parseQuotaData(provider, data);

        // T13: If resetAt already passed but provider still returned stale cumulative usage,
        // display 0 immediately and trigger a background probe to refresh snapshot.
        const hasStaleAfterReset = parsedQuotas.some((q) => q?.staleAfterReset === true);
        if (hasStaleAfterReset) {
          const lastProbeAt = staleProbeRef.current[connectionId] || 0;
          if (Date.now() - lastProbeAt >= MIN_FETCH_INTERVAL_MS) {
            staleProbeRef.current[connectionId] = Date.now();
            setTimeout(() => {
              fetchQuota(connectionId, provider, { force: true, silent: true }).catch(() => {});
            }, 5000);
          }
        }

        setQuotaData((prev) => ({
          ...prev,
          [connectionId]: {
            quotas: parsedQuotas,
            plan: data.plan || null,
            message: data.message || null,
            raw: data,
          },
        }));
        setLastRefreshedAt((prev) => ({
          ...prev,
          [connectionId]: new Date().toISOString(),
        }));
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          [connectionId]: error.message || "Failed to fetch quota",
        }));
      } finally {
        if (!silent) {
          setLoading((prev) => ({ ...prev, [connectionId]: false }));
        }
      }
    },
    []
  );

  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider, { force: true });
    },
    [fetchQuota]
  );

  const refreshAll = useCallback(async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      const response = await fetch("/api/usage/provider-limits", { method: "POST" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const connectionList = await fetchConnections();
      applyCachedQuotaState(connectionList, data.caches || {});
      setErrors(data.errors || {});
    } catch (error) {
      console.error("Error refreshing all:", error);
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshingAll, applyCachedQuotaState, fetchConnections]);

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      const [connectionList, caches] = await Promise.all([
        fetchConnections(),
        fetchCachedProviderLimits(),
      ]);
      applyCachedQuotaState(connectionList, caches);
      setInitialLoading(false);
    };
    init().catch(() => {
      setInitialLoading(false);
    });
  }, [applyCachedQuotaState, fetchCachedProviderLimits, fetchConnections]);

  const filteredConnections = useMemo(
    () =>
      connections.filter(
        (conn) =>
          USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) &&
          (conn.authType === "oauth" || conn.authType === "apikey")
      ),
    [connections]
  );

  const sortedConnections = useMemo(() => {
    const priority = {
      antigravity: 1,
      "gemini-cli": 2,
      github: 3,
      codex: 4,
      claude: 5,
      kiro: 6,
      glm: 7,
      "kimi-coding": 8,
    };
    return [...filteredConnections].sort(
      (a, b) => (priority[a.provider] || 9) - (priority[b.provider] || 9)
    );
  }, [filteredConnections]);

  useEffect(() => {
    if (initialLoading) return;
    for (const conn of sortedConnections) {
      if (initialLiveQuotaRequestedFor.current.has(conn.id)) continue;
      initialLiveQuotaRequestedFor.current.add(conn.id);
      void fetchQuota(conn.id, conn.provider);
    }
  }, [initialLoading, sortedConnections, fetchQuota]);

  const resolvedPlanByConnection = useMemo(() => {
    const out = {};
    for (const conn of sortedConnections) {
      out[conn.id] = resolvePlanValue(quotaData[conn.id]?.plan, conn.providerSpecificData);
    }
    return out;
  }, [sortedConnections, quotaData]);

  const tierByConnection = useMemo(() => {
    const out = {};
    for (const conn of sortedConnections) {
      out[conn.id] = normalizePlanTier(resolvedPlanByConnection[conn.id]);
    }
    return out;
  }, [sortedConnections, resolvedPlanByConnection]);

  const tierCounts = useMemo(() => {
    const counts = {
      all: sortedConnections.length,
      enterprise: 0,
      team: 0,
      business: 0,
      ultra: 0,
      pro: 0,
      plus: 0,
      free: 0,
      unknown: 0,
    };
    for (const conn of sortedConnections) {
      const tierKey = tierByConnection[conn.id]?.key || "unknown";
      counts[tierKey] = (counts[tierKey] || 0) + 1;
    }
    return counts;
  }, [sortedConnections, tierByConnection]);

  const visibleConnections = useMemo(() => {
    if (tierFilter === "all") return sortedConnections;
    return sortedConnections.filter(
      (conn) => (tierByConnection[conn.id]?.key || "unknown") === tierFilter
    );
  }, [sortedConnections, tierByConnection, tierFilter]);

  const groupedConnections = useMemo(() => {
    if (groupBy !== "environment") return null;
    const groups = new Map();
    for (const conn of visibleConnections) {
      const key = (conn.providerSpecificData?.tag as string | undefined)?.trim() || t("ungrouped");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(conn);
    }

    // Convert to sorted array based on tag string (ungrouped at the end)
    const sortedGroups = new Map(
      [...groups.entries()].sort(([a], [b]) => {
        if (a === t("ungrouped")) return 1;
        if (b === t("ungrouped")) return -1;
        return a.localeCompare(b);
      })
    );

    return sortedGroups;
  }, [groupBy, visibleConnections, t]);

  const handleSetGroupBy = (value: "none" | "environment") => {
    setGroupBy(value);
    localStorage.setItem(LS_GROUP_BY, value);
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupName) ? next.delete(groupName) : next.add(groupName);
      localStorage.setItem(LS_EXPANDED_GROUPS, JSON.stringify([...next]));
      return next;
    });
  };

  // Default inteligente: se não há preferência salva e há connections com grupo, abre em Por Ambiente
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSaved =
      localStorage.getItem(LS_GROUP_BY) !== null ||
      localStorage.getItem(LS_LEGACY_GROUP_BY) !== null;
    if (
      !hasSaved &&
      connections.some((c) => (c.providerSpecificData?.tag as string | undefined)?.trim())
    ) {
      setGroupBy("environment");
    }
  }, [connections]);

  // Quando entra em modo environment pela primeira vez sem estado salvo, abre todos os grupos
  useEffect(() => {
    if (groupBy !== "environment" || !groupedConnections) return;
    if (expandedGroups.size === 0) {
      const allGroups = new Set([...groupedConnections.keys()]);
      setExpandedGroups(allGroups);
      localStorage.setItem(LS_EXPANDED_GROUPS, JSON.stringify([...allGroups]));
    }
  }, [groupBy, groupedConnections]); // eslint-disable-line react-hooks/exhaustive-deps

  if (initialLoading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (sortedConnections.length === 0) {
    return (
      <Card className="rounded-xl border-border/50 shadow-sm" padding="lg">
        <div className="py-10 text-center">
          <span className="material-symbols-outlined text-[64px] opacity-15" aria-hidden>
            cloud_off
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-text-main">
            {t("noProviders")}
          </h3>
          <p className="mx-auto mt-2 max-w-[400px] text-sm text-text-muted">
            {t("connectProvidersForQuota")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl border-border/50 p-0 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-bg-subtle/25 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <span className="material-symbols-outlined shrink-0 text-text-muted/80" aria-hidden>
            speed
          </span>
          <h2 className="m-0 text-lg font-semibold tracking-tight text-text-main">
            {t("providerLimits")}
          </h2>
          <span className="text-[13px] text-text-muted">
            {t("accountsCount", { count: visibleConnections.length })}
            {visibleConnections.length !== sortedConnections.length &&
              ` ${t("filteredFromCount", { count: sortedConnections.length })}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border/60 bg-surface/80">
            <button
              type="button"
              onClick={() => handleSetGroupBy("none")}
              className={cn(
                "border-none px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                groupBy === "none"
                  ? "bg-bg-subtle text-text-main"
                  : "bg-transparent text-text-muted hover:text-text-main"
              )}
            >
              {t("viewFlat")}
            </button>
            <button
              type="button"
              onClick={() => handleSetGroupBy("environment")}
              className={cn(
                "border-l border-border/60 px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                groupBy === "environment"
                  ? "bg-bg-subtle text-text-main"
                  : "bg-transparent text-text-muted hover:text-text-main"
              )}
            >
              {t("viewByEnvironment")}
            </button>
          </div>

          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshingAll}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 bg-bg-subtle px-3.5 py-1.5 text-[13px] text-text-main transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[16px]",
                refreshingAll && "animate-spin"
              )}
            >
              refresh
            </span>
            {t("refreshAll")}
          </button>
        </div>
      </div>

      {/* Tier Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3 sm:px-5">
        {TIER_FILTERS.map((tier) => {
          if (tier.key !== "all" && !tierCounts[tier.key]) return null;
          const active = tierFilter === tier.key;
          return (
            <button
              type="button"
              key={tier.key}
              onClick={() => setTierFilter(tier.key)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 text-text-muted hover:border-border hover:text-text-main"
              )}
            >
              <span>{t(tier.labelKey)}</span>
              <span className="opacity-85">{tierCounts[tier.key] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Account rows — stacked: account bar + quota grid (avoids empty side columns when many models) */}
      <div className="overflow-hidden bg-surface">
        {(() => {
          const renderRow = (conn, isLast) => {
            const quota = quotaData[conn.id];
            const isLoading = loading[conn.id];
            const error = errors[conn.id];
            const config = PROVIDER_CONFIG[conn.provider] || {
              label: conn.provider,
              color: "#666",
            };
            const tierMeta = tierByConnection[conn.id] || normalizePlanTier(null);
            const resolvedPlan = resolvedPlanByConnection[conn.id];
            const refreshedAt = lastRefreshedAt[conn.id];

            return (
              <div
                key={conn.id}
                className={cn(
                  "px-4 py-4 transition-colors duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] sm:px-5",
                  !isLast && "border-b border-border/40"
                )}
              >
                <div className="flex flex-col gap-3">
                  {/* Top: account + last refresh + action */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                        <Image
                          src={`/providers/${conn.provider}.png`}
                          alt={conn.provider}
                          width={32}
                          height={32}
                          className="object-contain"
                          sizes="32px"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-text-main">
                          {conn.name || conn.displayName || conn.email || config.label}
                        </div>
                        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5">
                          <span
                            title={
                              resolvedPlan
                                ? t("rawPlanWithValue", { plan: resolvedPlan })
                                : t("noPlanFromProvider")
                            }
                            className="inline-flex shrink-0 items-center"
                          >
                            <Badge
                              variant={tierMeta.variant}
                              size="sm"
                              dot
                              className="h-5 leading-none"
                            >
                              {tierMeta.label}
                            </Badge>
                          </span>
                          <span className="text-[11px] leading-none text-text-muted">
                            {config.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {t("lastUsed")}
                        </div>
                        <div className="tabular-nums text-[12px] text-text-main">
                          {refreshedAt ? (
                            new Date(refreshedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshProvider(conn.id, conn.provider)}
                        disabled={isLoading}
                        title={t("refreshQuota")}
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/50 bg-bg-subtle/40 text-text-muted transition-colors hover:border-border hover:bg-sidebar hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span
                          className={cn(
                            "material-symbols-outlined text-[18px]",
                            isLoading && "animate-spin"
                          )}
                        >
                          refresh
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Quotas: responsive card grid */}
                  <div>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {t("modelQuotas")}
                      </span>
                      {!isLoading && !error && quota?.quotas?.length > 0 && (
                        <span className="tabular-nums text-[10px] text-text-muted">
                          {quota.quotas.length}
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <span className="material-symbols-outlined animate-spin text-[14px]">
                          progress_activity
                        </span>
                        {t("loadingQuotas")}
                      </div>
                    ) : error ? (
                      <div className="flex items-center gap-1.5 text-xs text-red-500">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                          {error}
                        </span>
                      </div>
                    ) : quota?.message && (!quota.quotas || quota.quotas.length === 0) ? (
                      <div className="text-xs italic text-text-muted">{quota.message}</div>
                    ) : quota?.quotas?.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {quota.quotas.map((q, i) => {
                          const usedPercentage = q.unlimited ? 0 : resolveUsedDisplayPercentage(q);
                          const colors = getBarColor(usedPercentage);
                          const cd = formatCountdown(q.resetAt);
                          const shortName = formatQuotaLabel(q.name);
                          const staleAfterReset = q.staleAfterReset === true;

                          return (
                            <div
                              key={i}
                              className="flex min-h-[92px] flex-col rounded-lg border border-border/50 bg-bg-subtle/20 p-2.5"
                            >
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <span
                                  title={q.modelKey || q.name}
                                  className="min-w-0 max-w-[calc(100%-3rem)] truncate rounded-md px-2 py-0.5 text-[11px] font-semibold leading-tight"
                                  style={{ background: colors.bg, color: colors.text }}
                                >
                                  {shortName}
                                </span>
                                <span
                                  className="shrink-0 tabular-nums text-[11px] font-semibold"
                                  style={{ color: colors.text }}
                                >
                                  {usedPercentage}%
                                </span>
                              </div>
                              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
                                <div
                                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                                  style={{
                                    width: `${Math.min(usedPercentage, 100)}%`,
                                    background: colors.bar,
                                  }}
                                />
                              </div>
                              <div className="mb-2 text-[10px] tabular-nums leading-tight text-text-muted">
                                {Number(q.used ?? 0).toLocaleString()} /{" "}
                                {q.total > 0 ? Number(q.total).toLocaleString() : "∞"}
                              </div>
                              <div className="mt-auto text-[10px] leading-tight text-text-muted">
                                {staleAfterReset ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined animate-spin text-[12px] opacity-80">
                                      progress_activity
                                    </span>
                                    {t("quotaRefreshing")}
                                  </span>
                                ) : cd ? (
                                  <span>⏱ {cd}</span>
                                ) : (
                                  <span className="opacity-50">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs italic text-text-muted">{t("noQuotaData")}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          if (groupedConnections) {
            const entries = [...groupedConnections.entries()];
            return entries.map(([groupName, conns]) => (
              <div
                key={groupName}
                className="mb-2 overflow-hidden rounded-xl border border-border/50 last:mb-0"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full cursor-pointer items-center gap-2 border-none bg-bg-subtle px-4 py-2.5 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  <span className="material-symbols-outlined text-[16px] text-text-muted">
                    {expandedGroups.has(groupName) ? "expand_less" : "expand_more"}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-text-muted">
                    folder
                  </span>
                  <span className="text-[12px] font-semibold text-text-main uppercase tracking-wider flex-1">
                    {groupName}
                  </span>
                  <span className="text-[11px] text-text-muted bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
                    {conns.length}
                  </span>
                </button>
                {expandedGroups.has(groupName) && (
                  <div>{conns.map((conn, idx) => renderRow(conn, idx === conns.length - 1))}</div>
                )}
              </div>
            ));
          }

          return visibleConnections.map((conn, idx) =>
            renderRow(conn, idx === visibleConnections.length - 1)
          );
        })()}

        {visibleConnections.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-text-muted">
            {t("noAccountsForTierFilter")}{" "}
            <strong>
              {t(TIER_FILTERS.find((tier) => tier.key === tierFilter)?.labelKey || "tierUnknown")}
            </strong>
            .
          </div>
        )}
      </div>
    </Card>
  );
}
