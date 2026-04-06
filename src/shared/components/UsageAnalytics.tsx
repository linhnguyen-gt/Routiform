"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import Card from "./Card";
import { CardSkeleton } from "./Loading";
import { cn } from "@/shared/utils/cn";
import { fmtCompact as fmt, fmtFull, fmtCost } from "@/shared/utils/formatting";
import {
  StatCard,
  ActivityHeatmap,
  DailyTrendChart,
  AccountDonut,
  ApiKeyDonut,
  ApiKeyTable,
  MostActiveDay7d,
  WeeklySquares7d,
  ModelTable,
  ProviderCostDonut,
  ModelOverTimeChart,
  ProviderTable,
} from "./analytics";
import { computeNormalizedEntropyFromByProvider } from "@/shared/utils/providerDiversityFromUsage";

function DetailMetric({
  label,
  value,
  warning,
}: {
  label: string;
  value: ReactNode;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        warning ? "border-amber-500/20 bg-amber-500/6" : "border-border/50 bg-surface/35"
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums",
          warning ? "text-amber-600 dark:text-amber-400" : "text-text-main"
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export type UsageAnalyticsProps = {
  /** Controlled range (e.g. shared with Provider Diversity card). If omitted, internal state is used. */
  range?: string;
  onRangeChange?: (range: string) => void;
};

export default function UsageAnalytics({
  range: rangeProp,
  onRangeChange,
}: UsageAnalyticsProps = {}) {
  const [internalRange, setInternalRange] = useState("30d");
  const range = rangeProp ?? internalRange;
  const setRange = (r: string) => {
    onRangeChange?.(r);
    if (rangeProp === undefined) setInternalRange(r);
  };
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/usage/analytics?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError((err as any).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const ranges = [
    { value: "1d", label: "1D" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "90d", label: "90D" },
    { value: "ytd", label: "YTD" },
    { value: "all", label: "All" },
  ];

  const topModel = useMemo(() => {
    const models = analytics?.byModel || [];
    return models.length > 0 ? models[0].model : "—";
  }, [analytics]);

  const topProvider = useMemo(() => {
    const providers = analytics?.byProvider || [];
    return providers.length > 0 ? providers[0].provider : "—";
  }, [analytics]);

  const busiestDay = useMemo(() => {
    const wp = analytics?.weeklyPattern || [];
    if (!wp.length) return "—";
    const max = wp.reduce((a, b) => (a.avgTokens > b.avgTokens ? a : b), wp[0]);
    return max.avgTokens > 0 ? max.day : "—";
  }, [analytics]);

  const providerCount = useMemo(() => {
    return (analytics?.byProvider || []).length;
  }, [analytics]);

  const providerDiversity = useMemo(() => {
    const { score01 } = computeNormalizedEntropyFromByProvider(analytics?.byProvider);
    return score01 * 100;
  }, [analytics]);

  if (loading && !analytics) return <CardSkeleton />;
  if (error) return <Card className="p-6 text-center text-red-500">Error: {error}</Card>;

  const s = analytics?.summary || {};

  const avgTokensPerReq = s.totalRequests > 0 ? Math.round(s.totalTokens / s.totalRequests) : 0;
  const costPerReq = s.totalRequests > 0 ? s.totalCost / s.totalRequests : 0;
  const ioRatio = s.completionTokens > 0 ? (s.promptTokens / s.completionTokens).toFixed(1) : "—";
  const fallbackPct = Number(s.fallbackRatePct || 0);
  const fallbackHigh = fallbackPct >= 25;

  return (
    <div className="flex flex-col gap-8">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text-main">Usage</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Volume, cost, and activity for the selected range. Charts below update together.
          </p>
        </div>
        <div
          className="inline-flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-black/3 p-1 dark:bg-white/3"
          role="group"
          aria-label="Time range"
        >
          {ranges.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                range === r.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPIs — single visual system (no rainbow) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="generating_tokens"
          label="Total tokens"
          value={fmt(s.totalTokens)}
          subValue={`${fmtFull(s.totalRequests)} requests`}
        />
        <StatCard icon="receipt_long" label="Total requests" value={fmtFull(s.totalRequests)} />
        <StatCard icon="payments" label="Est. cost" value={fmtCost(s.totalCost)} />
        <StatCard
          icon="swap_horiz"
          label="Fallback rate"
          value={`${fallbackPct.toFixed(1)}%`}
          subValue={`${fmtFull(s.fallbackCount || 0)} fallbacks`}
          tone={fallbackHigh ? "warning" : "default"}
          color={fallbackHigh ? "text-amber-600 dark:text-amber-400" : "text-text-main"}
        />
      </div>

      {/* Secondary metrics — dense but one surface */}
      <Card className="p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Token mix & signals
        </h3>
        <p className="mt-1 text-xs text-text-muted/90">
          Derived from the same window — use for tuning models and spend.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <DetailMetric label="Input tokens" value={fmt(s.promptTokens)} />
          <DetailMetric label="Output tokens" value={fmt(s.completionTokens)} />
          <DetailMetric label="I/O ratio" value={`${ioRatio}x`} />
          <DetailMetric label="Avg tokens / request" value={fmt(avgTokensPerReq)} />
          <DetailMetric label="Cost / request" value={fmtCost(costPerReq)} />
          <DetailMetric label="Accounts" value={s.uniqueAccounts ?? 0} />
          <DetailMetric label="API keys" value={s.uniqueApiKeys ?? 0} />
          <DetailMetric label="Models" value={s.uniqueModels ?? 0} />
          <DetailMetric label="Providers (usage)" value={providerCount} />
          <DetailMetric label="Top model" value={topModel} />
          <DetailMetric label="Top provider" value={topProvider} />
          <DetailMetric label="Busiest weekday" value={busiestDay} />
          <DetailMetric
            label="Diversity (usage-based)"
            value={`${providerDiversity.toFixed(1)}%`}
          />
        </div>
      </Card>

      {/* Activity row: stretch to one height — heatmap matches combined height of the two right cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <div className="min-h-0 min-w-0 lg:col-span-2">
          <ActivityHeatmap activityMap={analytics?.activityMap} />
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 lg:col-span-1">
          <div className="flex min-h-0 flex-1 basis-0 flex-col">
            <MostActiveDay7d activityMap={analytics?.activityMap} />
          </div>
          <div className="flex min-h-0 flex-1 basis-0 flex-col">
            <WeeklySquares7d activityMap={analytics?.activityMap} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DailyTrendChart dailyTrend={analytics?.dailyTrend} />
        <ProviderCostDonut byProvider={analytics?.byProvider} />
      </div>

      <ModelOverTimeChart
        dailyByModel={analytics?.dailyByModel}
        modelNames={analytics?.modelNames}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AccountDonut byAccount={analytics?.byAccount} />
        <ApiKeyDonut byApiKey={analytics?.byApiKey} />
      </div>

      <ProviderTable byProvider={analytics?.byProvider} />
      <ApiKeyTable byApiKey={analytics?.byApiKey} />
      <ModelTable byModel={analytics?.byModel} summary={s} />
    </div>
  );
}
